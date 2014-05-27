"use strict";

/////     Chart initialization     /////
nv.dev = false;

let types = ["keywords", "rules", "combined"];
let namespaces = ["58-cat", "edrules", "edrules_extended", "edrules_extended_kw"];

let interestsBarChart = nv.models.discreteBarChart()
  .x(function(d) { return d.label })
  .y(function(d) { return d.value })
  .tooltips(false)
  .showValues(true);

nv.addGraph(function() {
  d3.select('#interestsBarChart svg')
    .transition().duration(500)
    .call(interestsBarChart);
  nv.utils.windowResize(interestsBarChart.update);
  return interestsBarChart;
});

let DataService = function($rootScope) {
  this.rootScope = $rootScope;

  // relay messages from the addon to the page
  self.port.on("message", message => {
    this.rootScope.$apply(_ => {
      this.rootScope.$broadcast(message.content.topic, message.content.data);
    });
  });
}

DataService.prototype = {
  send: function _send(message, obj) {
    self.port.emit(message, obj);
  },
}

let aboutInterests = angular.module("aboutInterests", []);
aboutInterests.service("dataService", DataService);

aboutInterests.controller("vizCtrl", function($scope, dataService) {
  /** controller helpers **/
  $scope.makeChartData = function(data) {
    /**
     * Prepare data to be fed to D3.
     * Returns the data normalized and sorted in ascending order.
     */
    let valueTotal = 0
    for (let interestName in data) {
      valueTotal += data[interestName];
    }

    let dataPoints = [];
    for (let interestName in data) {
      dataPoints.push({
        label: interestName,
        value: (data[interestName]/valueTotal)*100,
      });
    }
    dataPoints.sort(function(a,b) {
      return b.value - a.value;
    })

    let chartData = {
      key: "interests",
      values: dataPoints,
    }
    return chartData;
  }

  $scope.redrawChart = function(elementSelector, chart, chartData) {

    d3.select(elementSelector)
      .datum([chartData])
    if (chart.update) {
      chart.update();
    }
  }

  $scope.getTypes = function () {
    return types;
  }

  $scope.getNamespaces = function () {
    return namespaces;
  }

  $scope._initialize = function () {
    $scope.historyComputeInProgress = false;
    $scope.historyComputeComplete = false;
    $scope.emptyMessage = "Your History was not analysed, please run the Full History Analysis.";
    $scope.rankingAvailable = false;
    $scope.daysLeft = null;
    $scope.daysLeftStart = null;
    dataService.send("chart_data_request");
  }
  $scope._initialize();

  /** UI functionality **/

  $scope.processHistory = function() {
    $scope._initialize();
    dataService.send("history_process");
    $scope.historyComputeInProgress = true;
  }

  $scope.updateGraphs = function() {
    dataService.send("chart_data_request");
  }

  $scope.$on("days_left", function(event, data) {
    $scope.historyComputeInProgress = true;
    if (!$scope.daysLeftStart) {
      $scope.daysLeftStart = data;
    }
    $scope.daysLeft = data;
    $scope.updateProgressBar();
  });

  $scope.$on("json_update", function(event, data) {
    ChartManager.appendToGraph(data.type, data.data);
  });

  $scope.$on("chart_init", function(event, data) {
    ChartManager.graphAllFromScratch(data, $scope.selectedType, $scope.selectedNamespace);
  });

  $scope.$on("ranking_data", function(event, data) {
    let chartData = $scope.makeChartData(data.rankings);
    if (data.rankings != null) {
      $scope.rankingAvailable = true;
      $scope.redrawChart("#interestsBarChart svg", interestsBarChart, chartData);
    }
    else {
      $scope.emptyMessage = "Unable to detect interests in your history. Please run the History Analysis after few days of browsing.";
    }

    if (data.submitComplete) {
      $scope.historyComputeInProgress = false;
      $scope.historyComputeComplete = true;
    }
  });

  $scope.updateProgressBar = function() {
    let elem = document.querySelector("#progressBar");
    elem.style.width = (100 - Math.round($scope.daysLeft/$scope.daysLeftStart*100)) + "%";
  }
});

self.port.on("style", function(file) {
  let link = document.createElement("link");
  link.setAttribute("href", file);
  link.setAttribute("rel", "stylesheet");
  link.setAttribute("type", "text/css");
  document.head.appendChild(link);
});
