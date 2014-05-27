/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
const {storage} = require("sdk/simple-storage");
const {Cu} = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");

function TimelineDataProcessor() {
}

function WeightIntensityDataProcessor() {
}

function IntentInterestDataProcessor() {
}

DataProcessorHelper = {
  initChartInStorage: function(dataNameString) {
    if (!storage.chartData) {
      storage.chartData = {};
    }
    if (!storage.chartData[dataNameString]) {
      storage.chartData[dataNameString] = {};
    }
  },

  iterateOverTypeNamespace: function(bucketData, storageData, dataProcessingFunction) {
    for (let type in bucketData) {
      for (let namespace in bucketData[type]) {
        if (!storageData[type]) {
          storageData[type] = {};
        }
        if (!storageData[type][namespace]) {
          storageData[type][namespace] = {};
        }
        dataProcessingFunction(bucketData[type][namespace], storageData[type][namespace]);
      }
    }
  },

  interestsToArray: function(interestObjects, interestList) {
    for (let category in interestObjects) {
      let arrayObj = {"category": category};
      for (let property in interestObjects[category]) {
        arrayObj[property] = interestObjects[category][property];
      }
      interestList.push(arrayObj);
    }
  },

  propertyComparator: function(property) {
    return function(a, b) {
        return a[property] - b[property];
    };
  },
}

TimelineDataProcessor.prototype = {
  _arraySum: function(arr) {
    sum = 0;
    for (element in arr) {
      sum += parseInt(arr[element]);
    }
    return sum;
  },

  _daysPostEpochToDate: function(dayCount) {
    return parseInt(dayCount) * 24 * 60 * 60 * 1000;
  },

  _setMaxWeightAndDateCount: function(storedData, interest, newDayWeight) {
    if (!storedData[interest]["maxWeight"] ||
        newDayWeight > storedData[interest]["maxWeight"]) {
      storedData[interest]["maxWeight"] = newDayWeight;
    }
    storedData[interest]["dayCount"] =
      Object.keys(storedData[interest]["dates"]).length;
  },

  consume: function(bucketData) {
    DataProcessorHelper.initChartInStorage("timelineData");
    for (let day in bucketData) {
      DataProcessorHelper.iterateOverTypeNamespace(bucketData[day], storage.chartData.timelineData, (bucketData, storedData) => {
        for (let interest in bucketData) {
          if (!storedData[interest]) {
            storedData[interest] = {};
            storedData[interest]["dates"] = {};
          }
          let domainsToCountMap = bucketData[interest];
          let visitCountSum = this._arraySum(domainsToCountMap);
          storedData[interest]["dates"][day] =
            {x: this._daysPostEpochToDate(day), size: visitCountSum, domainList: domainsToCountMap};
          this._setMaxWeightAndDateCount(storedData, interest, visitCountSum);
        }
      });
    }
    Services.obs.notifyObservers(null, "chart-update",
      JSON.stringify({"type": "timeline", "data": storage.chartData.timelineData}));
    return storage.chartData.timelineData;
  },
}

WeightIntensityDataProcessor.prototype = {
  _setXYMaxMin: function(storedData) {
    let categories = Object.keys(storedData["interests"]);
    let xVals = categories.map((category) => {
      return storedData["interests"][category]["x"];
    });
    storedData["xMax"] = Math.max.apply(null, xVals);
    storedData["xMin"] = Math.min.apply(null, xVals);

    let yVals = categories.map((category) => {
      return storedData["interests"][category]["y"];
    });
    storedData["yMax"] = Math.max.apply(null, yVals);
    storedData["yMin"] = Math.min.apply(null, yVals);
  },

  consume: function(bucketData) {
    DataProcessorHelper.initChartInStorage("weightIntensityData");
    DataProcessorHelper.iterateOverTypeNamespace(bucketData, storage.chartData.weightIntensityData, (bucketData, storedData) => {
      if (!storedData["interests"]) {
        storedData["interests"] = {};
      }

      // Sort interests by maxWeight and dayCount.
      let sortedByWeights = [];
      let sortedByDayCount = [];
      DataProcessorHelper.interestsToArray(bucketData, sortedByWeights);
      DataProcessorHelper.interestsToArray(bucketData, sortedByDayCount);
      sortedByWeights.sort(DataProcessorHelper.propertyComparator("maxWeight"));
      sortedByDayCount.sort(DataProcessorHelper.propertyComparator("dayCount"));

      // Rank interests.
      let rankMaxWeight = 1;
      let rankDayCount = 1;
      for (let i = 0; i < sortedByWeights.length; i++) {
        if (i > 0 && (sortedByWeights[i - 1]["maxWeight"] != sortedByWeights[i]["maxWeight"])) {
          rankMaxWeight++;
        }
        if (i > 0 && (sortedByDayCount[i - 1]["dayCount"] != sortedByDayCount[i]["dayCount"])) {
          rankDayCount++;
        }

        if (!storedData["interests"][sortedByWeights[i]["category"]]) {
          storedData["interests"][sortedByWeights[i]["category"]] = {};
        }
        if (!storedData["interests"][sortedByDayCount[i]["category"]]) {
          storedData["interests"][sortedByDayCount[i]["category"]] = {};
        }
        storedData["interests"][sortedByDayCount[i]["category"]]["x"] = rankDayCount;
        storedData["interests"][sortedByWeights[i]["category"]]["y"] = rankMaxWeight;
      }
      this._setXYMaxMin(storedData);
    });

    Services.obs.notifyObservers(null, "chart-update",
      JSON.stringify({"type": "weightIntensity", "data": storage.chartData.weightIntensityData}));
    return storage.chartData.weightIntensityData;
  },
}

IntentInterestDataProcessor.prototype = {
  _cartesianDistance: function(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(y1 - y2, 2) + Math.pow((x1 - x2), 2));
  },

  consume: function(bucketData) {
    DataProcessorHelper.initChartInStorage("intentInterestData");
    DataProcessorHelper.iterateOverTypeNamespace(bucketData, storage.chartData.intentInterestData, (bucketData, storedData) => {
      let intentX = bucketData["xMin"];
      let intentY = bucketData["yMax"];
      let interestX = bucketData["xMax"];
      let interestY = bucketData["yMax"];

      let sortedInterests = [];
      let sortedIntents = [];
      for (let category in bucketData["interests"]) {
        let categoryX = bucketData["interests"][category]["x"];
        let categoryY = bucketData["interests"][category]["y"];

        bucketData["interests"][category]["intentDist"] =
          this._cartesianDistance(intentX, intentY, categoryX, categoryY);
        bucketData["interests"][category]["interestDist"] =
          this._cartesianDistance(interestX, interestY, categoryX, categoryY);
      }
      DataProcessorHelper.interestsToArray(bucketData["interests"], sortedInterests);
      DataProcessorHelper.interestsToArray(bucketData["interests"], sortedIntents);
      sortedInterests.sort(DataProcessorHelper.propertyComparator("interestDist"));
      sortedIntents.sort(DataProcessorHelper.propertyComparator("intentDist"));

      for (let i = 0; i < 10; i++) {
        storage.chartData.intentInterestData["sortedIntents"] = sortedIntents;
        storage.chartData.intentInterestData["sortedInterests"] = sortedInterests;
      }
    });
  },
}

exports.TimelineDataProcessor = TimelineDataProcessor;
exports.WeightIntensityDataProcessor = WeightIntensityDataProcessor;
exports.IntentInterestDataProcessor = IntentInterestDataProcessor;