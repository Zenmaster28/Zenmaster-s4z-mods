import * as locale from '/shared/sauce/locale.mjs';
import * as common from '/pages/src/common.mjs';
import {Color} from '/pages/src/color.mjs';
import * as ec from '/pages/deps/src/echarts.mjs';
import * as theme from '/pages/src/echarts-sauce-theme.mjs';
import * as zen from './segments-xCoord.mjs';

locale.setImperial(!!common.storage.get('/imperialUnits'));
ec.registerTheme('sauce', theme.getTheme('dynamic'));
const H = locale.human;
let routeSegments = [];
let allMarkLines = [];
let beaconSubs = [];
//let missingLeadinRoutes = await fetch("data/missingLeadinRoutes.json").then((response) => response.json()); 
const allRoutes = await zen.getAllRoutes();

export class SauceElevationProfile {
    constructor({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showNextSegmentFinish, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, behindDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showRobopacersGap, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, pinName, useCustomPin, customPin, zoomSegmentOnlyWithinApproach, showAllArches, showGroups, showLineAhead, distanceAhead, aheadLineColor, aheadLineType, showNextPowerup, disablePenRouting, zoomRemainingRoute, showCurrentAltitude, showRouteMaxElevation, showXaxis, xAxisIncrements, xAxisInverse, refresh=1000}) {
        this.debugXcoord = false;
        this.debugXcoordDistance = null;
        this.debugPinPlacement = false;
        this.debugPinRoad = null;
        this.debugPinRP = null;
        this.debugPinDistance = null;
        this.el = el;
        this.worldList = worldList;
        this.preferRoute = preferRoute;
        this.showMaxLine = showMaxLine;
        this.showCurrentAltitude = showCurrentAltitude;
        this.showRouteMaxElevation = showRouteMaxElevation;
        this.disablePenRouting = disablePenRouting;
        this.showLapMarker = showLapMarker;
        this.showCompletedLaps = showCompletedLaps;
        this.showTeamMembers = showTeamMembers;
        this.showMarkedRiders = showMarkedRiders;
        this.showAllRiders = showAllRiders;
        this.showRobopacers = showRobopacers;
        this.showRobopacersGap = showRobopacersGap;
        this.showLeaderSweep = showLeaderSweep;
        this.showGroups = showGroups;
        this.showNextPowerup = showNextPowerup;
        this.groups = [];
        this.colorScheme = colorScheme;
        this.gradientOpacity = gradientOpacity;
        this.lineTextColor = lineTextColor;
        this.currentLap = -1;
        this.lapCounter = 0;
        this.watchingTeam = "";
        this.watchingPosition = 0;
        this.showSegmentStart = showSegmentStart;  
        this.showSegmentFinish = showSegmentFinish;
        this.showAllArches = showAllArches;
        this.minSegmentLength = minSegmentLength;
        this.showLoopSegments = showLoopSegments;
        this.showNextSegment = showNextSegment;
        this.showNextSegmentFinish = showNextSegmentFinish;
        this.lineType = lineType;
        this.lineTypeFinish = lineTypeFinish;
        this.lineSize = lineSize;
        this.pinSize = pinSize;
        this.pinColor = pinColor;
        this.pinColorMarked = pinColorMarked;
        this.pinName = pinName;
        this.useCustomPin = useCustomPin;
        this.customPin = customPin;
        this.showMyPin = showMyPin;
        this.setAthleteSegmentData = setAthleteSegmentData;
        const {fontScale} = common.settingsStore.get();        
        this.fontScale = fontScale;
        this.deltas = [];
        this.deltaIgnoreCount = 0;
        this.routeOffset = false;
        this.routeOverride = false;
        this.routeOverrideTS = Date.now() - 30000;
        this.routeDistances = [];
        this.routeElevations = [];
        this.routeInfo = [];
        this.routeSegments = [];
        this.routeGrades = [];
        this.routeColorStops = [];
        this.foundRoute = false;
        this.foundRouteRoadseg = false;
        this.overrideDistance = overrideDistance;
        this.overrideLaps = overrideLaps;
        this.customDistance = 0;
        this.customFinishLine;
        this.yAxisMin = yAxisMin;
        this.singleLapView = singleLapView;
        this.profileZoom = profileZoom;
        this.zoomNextSegment = zoomNextSegment;
        this.zoomSegmentOnlyWithinApproach = zoomSegmentOnlyWithinApproach;
        this.zoomedIn = false;
        this.zoomNextSegmentApproach = zoomNextSegmentApproach;
        this.zoomFinalKm = zoomFinalKm;
        this.zoomSlider = zoomSlider;
        this.zoomRemainingRoute = zoomRemainingRoute;
        this.zoomIdx = {
            start: null,
            finish: null
        };
        this.forwardDistance = forwardDistance;
        this.behindDistance = behindDistance;
        this.refresh = refresh;
        this._lastRender = 0;
        this._refreshTimeout = null; 
        this.customPOI = [];
        this.editedSegments = []; 
        this.showLineAhead = showLineAhead;
        this.distanceAhead = distanceAhead;
        this.aheadLineColor = aheadLineColor;
        this.aheadLineType = aheadLineType;
        this.showXaxis = showXaxis;  
        this.xAxisInverse = xAxisInverse;
        this.xAxisIncrements = xAxisIncrements; 
        this.courseRoads = [];   
        el.classList.add('sauce-elevation-profile-container');
        this.chartXaxis = ec.init(document.getElementById('xAxis'));  
        this.chart = ec.init(el, 'sauce', {renderer: 'svg'});
        this.chart.setOption({
            animation: false,
            tooltip: {
                trigger: 'axis',
                formatter: ([{value}]) => {
                    if (!value) {
                        return '';
                    }
                    this.hoverPoint = value;
                    if (this.watchingId && this.showMyPin) {
                    const series = this.showGroups ? 1 : 0;
                    let watchingPin =  this.chart.getOption().series[series].markPoint.data.find(x => x.name == this.watchingId)
                    if (typeof(watchingPin) != "undefined") {
                        const dist = (this.reverse && this._distances) ?
                        this._distances.at(-1) - value[0] : value[0];
                        let toGo = (H.distance((dist) - watchingPin.coord[0], {suffix: true}));    
                        if (toGo.replace("km","").replace("m","") > 0) {
                        return `Dist: ${H.distance(dist, {suffix: true})}<br/>` +
                            `To Go: ${toGo}<br/>` +
                            `<ms large>landscape</ms>${H.elevation(value[1], {suffix: true})} ` +
                            `<small>(${H.number(value[2] * 100, {suffix: '%'})})</small>`;
                        } else {
                            return `Dist: ${H.distance(dist, {suffix: true})}<br/>` +                            
                            `<ms large>landscape</ms>${H.elevation(value[1], {suffix: true})} ` +
                            `<small>(${H.number(value[2] * 100, {suffix: '%'})})</small>`;
                        }
                    } else {
                        return;
                    }
                    } else {
                        const dist = (this.reverse && this._distances) ?
                            this._distances.at(-1) - value[0] : value[0];
                        return `Dist: ${H.distance(dist, {suffix: true})}<br/>` +                            
                        `<ms large>landscape</ms>${H.elevation(value[1], {suffix: true})} ` +
                        `<small>(${H.number(value[2] * 100, {suffix: '%'})})</small>`;
                    }                    
                },
                axisPointer: {z: -1},
            },
            xAxis: {
                type: 'value',
                boundaryGap: false,
                show: false,
                min: 'dataMin',
                max: 'dataMax',
            },
            yAxis: {
                show: false,
                type: 'value',
            },
            series: [{
                name: 'Elevation',
                smooth: 0.5,
                type: 'line',
                symbol: 'none',
                z: 1,
                emphasis: {
                    disabled: true
                },
                areaStyle: {
                    origin: 'start',
                },                
                encode: {
                    x: 0,
                    y: 1,
                    tooltip: [0, 1, 2]
                },
                markLine: {
                    symbol: 'none',
                    silent: true,
                    lineStyle: {},
                }
            },{
                name: 'WatchingPin',                
                type: 'line',
                z: 2
            }]
        });        
        this.courseId = null;
        this.athleteId = null;
        this.watchingId = null;
        this.roads = null;
        this.road = null;
        this.route = null;
        this.routeId = null;
        this.lastRouteId = null;
        this.reverse = null;
        this.marks = new Map();
        this._distances = null;
        this._elevations = null;
        this._grades = null;
        this._roadSigs = null;
        this._statesQueue = [];
        this._busy = false;
        this.onResize();
        let self = this;
        this.newPOIClicked = false;
        this._resizeObserver = new ResizeObserver(() => this.onResize());
        this._resizeObserver.observe(this.el);
        this._resizeObserver.observe(document.documentElement);  
        const rightPanel = document.getElementById("rightPanel");
        const newPOIbutton = document.getElementById('newPOIbutton')
        
        if (newPOIbutton) {
            newPOIbutton.addEventListener('click', ev => {
                this.newPOIClicked = true;
                document.documentElement.classList.toggle('settings-mode'); 
            });
        }
        if (rightPanel) {        
            rightPanel.addEventListener('mouseup', ev => {                
                if (this.newPOIClicked) {
                    this.createPOI(ev, self, this.hoverPoint[0]); 
                };
            });  
            rightPanel.addEventListener('touchend', ev => {                
                if (this.newPOIClicked) {
                    this.createPOI(ev, self, this.hoverPoint[0]);                    
                };
            });                
            this.chart.on('click', function (params) {
                if (params.componentType == 'markPoint') {
                    //console.log("markpoint clicked",params)
                    let clickedGroup = self.groups.find(grp => grp.athletes.some(athlete => athlete.athleteId == params.data.name))
                    console.log("Clicked group:",clickedGroup)
                    //debugger
                }
            })
            rightPanel.addEventListener('click', ev => {                 
                if (ev.ctrlKey) {
                    this.createPOI(ev, self, this.hoverPoint[0]);
                    
                } else if (this.zoomSlider && !this.newPOIClicked) {
                    
                    //console.log("rightPanel click and zoomSlider is enabled")
                    let dz = this.chart.getOption().dataZoom
                    let dzShow;
                    if (dz[0]?.show == true) {
                        // the slider is currently visible so toggle if off, get the current start and end values and recalculate the colorstops                    
                        dzShow = false
                        let dzStart = dz[0].startValue;
                        let dzEnd = dz[0].endValue;
                        
                        let idxStart = common.binarySearchClosest(this.routeDistances, (dzStart)); 
                        let idxFinish = common.binarySearchClosest(this.routeDistances, (dzEnd)); 
                        const distance = dzEnd - dzStart;
                        const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));                                    
                        const newColorStops = dataZoomColorStops.map((stop, i) => ({
                            offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance),
                            color: stop.color
                        })) 
                        this.chart.setOption({                    
                            series: [{
                                areaStyle: {
                                    color: {
                                        colorStops: newColorStops
                                    },
                                    opacity: this.gradientOpacity
                                }
                            }]                                                                           
                        })
                        this.scaleXaxis(dzStart, dzEnd)
                    } else {   
                        //slider is off, toggle it on                 
                        dzShow = true
                    }            
                    this.chart.setOption({
                        dataZoom: [{
                            type: "slider",
                            top: "middle",
                            left: 5,
                            right: 10,
                            show: dzShow
                        }]
                    })
                }
            })
        }                      
    }
    createPOI(ev, self, xValue) { 
        if (self.activePOIHandler) {
            document.getElementById("poiInput").removeEventListener("keydown", self.activePOIHandler);
        }
        const newPOIdiv = document.getElementById("newPOIdiv")
        const poiInput = document.getElementById("poiInput")
        newPOIdiv.style.display = "block";
        newPOIdiv.style.left = ev.clientX + "px";
        let vPos = (window.innerHeight - newPOIdiv.offsetHeight) / 3;
        newPOIdiv.style.top = vPos + "px";
        poiInput.focus();
        function handleKeypress(e) {                        
            if (e.key === "Enter") { 
                if (poiInput.value != "") {                    
                    newPOIdiv.style.display = "none";
                    self.customPOI.push({
                        name: poiInput.value,
                        markLine: xValue,
                        id: Math.floor(Math.random() * 10000),
                        type: "custom",
                        repeat: 1
                    })
                    poiInput.value = "";
                    self.setRoute(self.routeId)
                    poiInput.removeEventListener("keydown", handleKeypress)
                    self.newPOIClicked = false;
                    self.activePOIHandler = null;
                } else {
                    poiInput.value = "";
                    newPOIdiv.style.display = "none";
                    poiInput.removeEventListener("keydown", handleKeypress)
                    self.newPOIClicked = false;
                    self.activePOIHandler = null;
                }                           
            } else if (e.key === "Escape") {                
                poiInput.value = "";
                newPOIdiv.style.display = "none";
                poiInput.removeEventListener("keydown", handleKeypress)
                self.newPOIClicked = false;
                self.activePOIHandler = null;
            }
        }
        self.activePOIHandler = handleKeypress
        poiInput.addEventListener("keydown", handleKeypress);
        
        //debugger
    }
    destroy() {
        this._resizeObserver.disconnect();
        this.chart.dispose();
        this.el.remove();
    }

    _updateFontSizes() {
        this._docFontSize = Number(getComputedStyle(document.documentElement).fontSize.slice(0, -2));
        this._elFontSize = Number(getComputedStyle(this.el).fontSize.slice(0, -2));
    }

    em(scale) {
        return this._elFontSize * scale;
    }

    rem(scale) {
        return this._docFontSize * scale;
    }

    onResize() {
        this._updateFontSizes();
        this.chart.resize();
        this.chartXaxis.resize();
        const axisPad = this.em(0.2);
        const tooltipSize = 0.4;        
        this.chart.setOption({
            grid: {top: this.em(1), right: 0, bottom: 0, left: 0},
            series: [{
                markLine: {
                    label: {
                        fontSize: this.em(0.2 * this.fontScale),
                        distance: this.em(0.18 * 0.4)
                    }
                }
            }],
            tooltip: {
                position: ([x, y], params, dom, rect, size) => {
                    if (x > size.viewSize[0] / 2) {
                        return [x - size.contentSize[0] - axisPad, axisPad];
                    } else {
                        return [x + axisPad, axisPad];
                    }
                },
                textStyle: {
                    fontSize: this.em(tooltipSize),
                    lineHeight: this.em(tooltipSize * 1.15),
                },
                padding: [this.em(0.1 * tooltipSize), this.em(0.3 * tooltipSize)],
            },
        });
        this.renderAthleteStates([], /*force*/ true);
    }    
    clear() {
        this.route = null;
        this.routeId = null;
        this._eventSubgroupId = null;
        this._routeLeadinDistance = 0;
        this.road = undefined;
        this.reverse = undefined;
        this.curvePath = undefined;
        this.setData([], [], []);
    }

    setCourse = common.asyncSerialize(async function(id) {
        if (id === this.courseId) {
            return;
        }
        this.courseId = id;
        this.road = null;
        this.route = null;
        this.routeId = null;
        this.marks.clear();
        this.roads = (await common.getRoads(id)).concat(await common.getRoads('portal'));
    });

    setAthlete(id) {
        if (id === this.athleteId) {
            return;
        }
        console.debug("Setting self-athlete:", id);
        if (this.athleteId != null && this.marks.has(this.athleteId)) {
            this.marks.get(this.athleteId).self = false;
        }
        this.athleteId = id;
        if (id != null && this.marks.has(id)) {
            const mark = this.marks.get(id);
            mark.watching = false;
            mark.self = true;
        }
    }

    setWatching(id) {
        if (id === this.watchingId) {
            return;
        }
        console.debug("Setting watching-athlete:", id);
        if (this.watchingId != null && this.marks.has(this.watchingId)) {
            this.marks.get(this.watchingId).watching = false;
        }
        this.watchingId = id;
        if (id != null && id !== this.athleteId && this.marks.has(id)) {
            this.marks.get(id).watching = true;
        }
    }

    setRoad(id, reverse=false, roadSegments) {
        let markLines = [];
        allMarkLines.length = 0;
        for (let segment of roadSegments) {
            for (let markline of segment.markLines) {
                //debugger
                if (this.showSegmentStart && !markline.name.includes("Finish")) {
                    markLines.push({
                        xAxis: markline.markLine,
                        lineStyle: {
                            width: this.lineSize,
                            type: this.lineType,
                            color: this.lineTextColor
                        },
                        label: {
                            distance: 7,
                            position: 'insideEndTop',                    
                            formatter: markline.name,
                            color: this.lineTextColor,
                            rotate: 90
                        }
                    });
                } else if (this.showSegmentFinish && markline.name.includes("Finish")) {
                    markLines.push({
                        xAxis: markline.markLine,
                        lineStyle: {
                            width: this.lineSize,
                            type: this.lineTypeFinish,
                            color: this.lineTextColor
                        },
                        label: {
                            show: true,                            
                            formatter: '|||',
                            color: this.lineTextColor,
                            rotate: 0
                        }
                    });
                }
                //allMarkLines.push(markline)
            }
        }
        //debugger
        //console.log(markLines)
        routeSegments.length = 0;
        //allMarkLines.length = 0;
        this.lapCounter = 1;
        let nextSegmentDiv = document.getElementById('nextSegmentDiv');
        if (this.showNextSegment && (this.showSegmentStart || this.showAllArches)) {
            nextSegmentDiv.innerHTML = "";
            nextSegmentDiv.style.visibility = "";
        } else {
            nextSegmentDiv.innerHTML = "";
            nextSegmentDiv.style.visibility = "hidden";
        }
        const athleteSegmentData = {
            segmentData: {
                currentPosition: 0,
                routeSegments: routeSegments,
                nextSegment: {
                }
            }
        }
        common.rpc.updateAthleteData(this.watchingId, athleteSegmentData)  //reset any segment data when off a route
        this.route = null;
        this.routeId = null;
        this._eventSubgroupId = null;
        this._roadSigs = new Set();
        this._routeLeadinDistance = 0;
        this.road = this.roads ? this.roads.find(x => x.id === id) : undefined;
        if (this.road) {
            console.log(this.road)
            this.reverse = reverse;
            this.curvePath = this.road.curvePath;
            this._roadSigs.add(`${id}-${!!reverse}`);  
            //debugger          
            this.setData(this.road.distances, this.road.elevations, this.road.grades, {reverse, markLines});
        } else {
            this.reverse = undefined;
            this.curvePath = undefined;
        }
        
    }
    setSegment = common.asyncSerialize(async function(segment) {
        const distances = Array.from(segment.distances);
        const elevations = Array.from(segment.elevations);
        const grades = Array.from(segment.grades);        
        this.curvePath = segment.curvePath
        this.setData(distances, elevations, grades);
        //debugger
    })

    setRoute = common.asyncSerialize(async function(id, {laps=1, eventSubgroupId, distance}={}) {         
        distance = parseFloat(distance);        
        if (distance) {
            this.customDistance = distance
        } else {
            this.customDistance = 0;
        };          
        this.road = null;
        this.reverse = null;
        routeSegments.length = 0;
        allMarkLines.length = 0;
        this.routeId = id;
        this.lastRouteId = id;
        this.lapCounter = 0;
        const markLines = [];
        //let routeDistances;
        //let routeElevations;
        //let routeGrades;
        //console.log("eventSubgroupId", eventSubgroupId)
        let disableRouteOptimization = true
        if (eventSubgroupId && eventSubgroupId != 0) { // don't do advanced routing outside of events
            disableRouteOptimization = this.disablePenRouting
        }
        //debugger
        //let segmentsOnRoute = await zen.processRoute(this.courseId, this.routeId, laps, distance, this.showLoopSegments, this.showAllArches, this.disablePenRouting)
        let segmentsOnRoute = await zen.processRoute(this.courseId, this.routeId, laps, distance, this.showLoopSegments, this.showAllArches, disableRouteOptimization)
        this.routeInfo = segmentsOnRoute;
        this.routeDistances = Array.from(segmentsOnRoute.routeFullData.distances);                    
        this.routeElevations = Array.from(segmentsOnRoute.routeFullData.elevations);        
        this.routeGrades = Array.from(segmentsOnRoute.routeFullData.grades);          
        if (this.showSegmentStart || this.showAllArches)
        {   
            for (let segment of segmentsOnRoute.segments) {
                routeSegments.push(segment)
            }
            
            if (this.customPOI.length > 0) {
                for (let poi of this.customPOI) {
                    if (this.editedSegments && this.editedSegments.length > 0 && this.editedSegments.find(x => x.id == poi.id)) {
                        //debugger
                        poi.name = this.editedSegments.find(x => x.id == poi.id).displayName;
                        segmentsOnRoute.markLines.push(poi)                        
                    } else {                        
                        segmentsOnRoute.markLines.push(poi)
                    }
                }
            }  
            if (!this.showSegmentStart && this.showAllArches) {
                segmentsOnRoute.markLines = segmentsOnRoute.markLines.filter(x => x.name.includes("Finish"))
                for (let ml of segmentsOnRoute.markLines) {
                    ml.finishArchOnly = true
                }
                //debugger
            }
            for (let markline of segmentsOnRoute.markLines) {                
                if (this.editedSegments && this.editedSegments.length > 0) {                    
                    let segCheck = this.editedSegments.find(x => x.id == markline.id && x.Repeat == markline.repeat)                         
                    if (segCheck) {
                        if (!segCheck.Include) {
                            continue // if the segment is included, go to next item
                        }                        
                        if (segCheck.displayName != markline.name) {                            
                            if (markline.name.includes("Finish")) {
                                markline.displayName = segCheck.displayName + " Finish"
                            } else {
                                markline.displayName = segCheck.displayName;
                            }
                        }
                    }
                    
                }
                allMarkLines.push(markline)
                if (this.lineTypeFinish.includes("["))
                {
                    this.lineTypeFinish = JSON.parse("[" + this.lineTypeFinish + "]")[0];
                }                               
                if (markline.name.includes("Finish") && markline.type != "custom" && !markline.finishArchOnly) {
                    if (this.showSegmentFinish && markline.segLength > this.minSegmentLength) {
                        markLines.push({
                            xAxis: markline.markLine,
                            lineStyle: {
                                width: this.lineSize,
                                type: this.lineTypeFinish,
                                color: this.lineTextColor
                            }, 
                            label: {
                                show: true,                            
                                formatter: '|||',
                                color: this.lineTextColor,
                                rotate: 0
                            }
                        }); 
                    }
                } else if (markline.finishArchOnly) {
                    let archSymbol = 
                    markLines.push({
                        xAxis: markline.markLine,
                        lineStyle: {
                            width: this.lineSize,
                            type: this.lineTypeFinish,
                            color: this.lineTextColor
                        }, 
                        label: {
                            show: true,                            
                            formatter: '\u25e0',  
                            fontSize: this.em(0.4 * this.fontScale),
                            color: this.lineTextColor,
                            rotate: 0
                        }
                    });
                } else {
                    let marklineName = markline.displayName ? markline.displayName : markline.name;
                    markLines.push({
                        xAxis: markline.markLine,
                        lineStyle: {
                            width: this.lineSize,
                            type: this.lineType,
                            color: this.lineTextColor
                        },
                        label: {
                            distance: 7,
                            position: 'insideEndTop',                    
                            formatter: marklineName,
                            color: this.lineTextColor,
                            rotate: 90
                        }
                    });
                }
            }
            
        }
        this._eventSubgroupId = eventSubgroupId;
        this._roadSigs = new Set();
        this.curvePath = null;  
        //this.route = await zen.getModifiedRoute(id, disableRouteOptimization);
        this.route = this.routeInfo.routeFullData
        for (const {roadId, reverse} of this.route.manifest) {
            this._roadSigs.add(`${roadId}-${!!reverse}`);
        }        
        this.curvePath = this.route.curvePath.slice();
        const distances = Array.from(this.route.distances);
        const elevations = Array.from(this.route.elevations);
        const grades = Array.from(this.route.grades);        
        const markAreas = [];
        const notLeadin = this.route.manifest.findIndex(x => !x.leadin);
        const lapStartIdx = notLeadin === -1 ? 0 : this.curvePath.nodes.findIndex(x => x.index === notLeadin);        
        if ((lapStartIdx || this.showCompletedLaps) && this.showLapMarker) {
            markLines.push({
                xAxis: distances[lapStartIdx],
                lineStyle: {
                    width: this.lineSize, 
                    type: this.lineType,
                    color: this.lineTextColor
                },
                label: {
                    distance: 7,
                    position: 'insideMiddleBottom',
                    formatter: `LAP`,
                    color: this.lineTextColor,
                    rotate: 90
                }
            });            
            this._routeLeadinDistance = distances[lapStartIdx];
        } else {
            this._routeLeadinDistance = 0;
        }
        
        const lapDistance = distances.at(-1) - distances[lapStartIdx];
        if (distance) {
            laps = this.route.supportedLaps ? Infinity : 1;            
        }
        for (let lap = 1; lap < laps; lap++) { 
            //debugger
            if (this.route.lapFiller.curvePath?.nodes?.length > 0) {
                this.curvePath.extend(this.route.lapFiller.curvePath)
                for (let i = 0; i < this.route.lapFiller.distances.length; i++) {
                    distances.push(distances.at(-1) + (this.route.lapFiller.distances[i] - (this.route.lapFiller.distances[i - 1] || 0)));
                    elevations.push(this.route.lapFiller.elevations[i]);
                    grades.push(this.route.lapFiller.grades[i]);
                };                            
            }
            //debugger
            const lapStartIdxDiff = this.route.lapFiller.curvePath?.nodes?.length || 0;
            this.curvePath.extend(this.route.curvePath.slice(lapStartIdx, this.curvePath.nodes.length - lapStartIdxDiff));
            //debugger
            for (let i = lapStartIdx; i < this.route.distances.length; i++) {
                distances.push(distances.at(-1) +
                    (this.route.distances[i] - (this.route.distances[i - 1] || 0)));
                elevations.push(this.route.elevations[i]);
                grades.push(this.route.grades[i]);
            }            
            
            if (distance && distances[distances.length - 1] >= distance + 200) {
                break;
            }
            if (distance && distances.at(-1) < distance + 200) {
                console.log("distance is less than the leadin!")
                break;
            }
            if (this.showLapMarker)
            {    
                markLines.push({
                    //xAxis: this._routeLeadinDistance + lapDistance * lap,
                    xAxis: this.routeInfo.routeFullData.distances.at(this.routeInfo.routeFullData.lapNodes[lap]),
                    lineStyle: {
                        width: this.lineSize, 
                        type: this.lineType,
                        color: this.lineTextColor
                    },
                    label: {
                        distance: 7,
                        position: 'insideMiddleBottom',
                        formatter: `LAP ${lap + 1}`,
                        color: this.lineTextColor,
                        rotate: 90
                    }
                });
            }
        }          
        if (distance) {
            while (distances[distances.length - 1] > distance + 200) {
                distances.pop();
                elevations.pop();
                grades.pop();
            }
        }
            
        
        if (this.routeOffset)
            {
                let offsetIdx = distances.findIndex(x => x > this.customDistance - this.routeOffset)                
                console.log("offset index: " + offsetIdx + " offset distance: " + (this.customDistance - this.routeOffset))
                let xDist = (this.customDistance - this.routeOffset).toFixed(0);
                this.customFinishLine = xDist;
                
                markLines.push({
                    xAxis: xDist,
                    lineStyle: {
                        width: this.lineSize, 
                        type: this.lineTypeFinish,
                        color: this.lineTextColor
                    },
                    label: {
                        distance: 7,
                        position: 'insideEndTop',
                        formatter: `Finish`,
                        color: this.lineTextColor
                    }
                });
                //if (!isNaN(markLineIndex)) {   
                    //allMarkLines.push({name: "Finish", markLine: xDist, id: null})
                //}
            }
            if (this.customDistance > 0) {
                
                allMarkLines = allMarkLines.filter(x => x.markLine < distances.at(-1))
            }
            
        allMarkLines.sort((a, b) => {
            return a.markLine - b.markLine;
        });
        
        //console.log(allMarkLines)
        //console.log(routeSegments)
        //console.log(this.routeDistances)
        //console.log(routeDistances)
        //this.setData(distances, elevations, grades, {markLines, markAreas});        
        this.setData(this.routeDistances, this.routeElevations, this.routeGrades, {markLines, markAreas});
        //this.showXaxis = true;
        if (this.showXaxis) {
            const min = 0;
            const max = this.routeDistances.at(-1);            
            this.scaleXaxis(min, max);
        }
        /*
        //figuring out axis tickmarks, for possible future use.
        this.chart.setOption({
            xAxis: [{
                show: true,
                min: 0,
                offset: 10,
                max: this.routeDistances.at(-1),
                splitLine: {
                    show: false
                },
                axisTick: {
                    show: true,
                    inside: false,
                    length: 25,
                    lineStyle: {
                        color: 'red',
                        width: 5
                    }
                },
                axisLine: {
                    show: true,
                    lineStyle: {
                        color: 'red',
                        width: 5
                    }
                },
                axisLabel: {
                    show: true,
                    fontSize: 15
                }
            }]
        });
        console.log(this.chart.getOption())
        */
        return this.route;
    });
    scaleXaxis(min, max) { 
        if (!this.showXaxis) {
            return;
        }
        let interval;
        if (!this.xAxisIncrements) {
            const diff = max - min;
            if (diff <= 15000) {
                interval = 1000;
            } else if (diff <= 50000) {
                interval = 5000;
            } else if (diff <= 100000) {
                interval = 10000;
            } else {
                interval = 20000;
            }
        } else {
            interval = this.xAxisIncrements * 1000;
        }
        const tickSize = 10;
        let tickMarks = [];
        const inverse = this.xAxisInverse;
        if (inverse) {
            const zoomMax = this.routeDistances.at(-1) - min;
            const zoomMin = this.routeDistances.at(-1) - max;
            for (let i = interval; i <= zoomMax; i += interval) {
                if (i >= zoomMin) {
                    tickMarks.push(i);
                }
            }   
            tickMarks.reverse()  
            max = zoomMax;
            min = zoomMin;       
        } else {
            for (let i = interval; i <= max; i += interval) {
                if (i >= min) {
                    tickMarks.push(i);
                }
            }
        }
        //console.log("tickMarks",tickMarks)
        //console.log("min", min, "max", max)
        const option = {
            animation: false,
            grid: {
                left: 0,
                right: 0,
                top: 0
            },
            xAxis: {
                type: 'value',
                min: min,
                max: max,
                inverse: inverse,
                axisLine: {
                    show: true
                },
                axisTick: {
                    show: true,
                    length: tickSize,
                    customValues: tickMarks,
                    lineStyle: {
                        color: this.lineTextColor,
                        width: this.lineSize
                    }
                },
                axisLabel: {
                    show: true,
                    margin: tickSize,
                    fontSize: this.fontScale * 15,
                    color: this.lineTextColor,
                    customValues: tickMarks,
                    formatter: function (value) {
                        return value / 1000;                        
                    }
                },
                splitLine: {
                    show: false
                }
            },
            yAxis: {
                show: false
            },
            series: []
        };

        this.chartXaxis.setOption(option);
        document.getElementById("rightPanel").style.bottom = "30px"
        //this.el.style.setProperty('--profile-height', 0.9);
        this.el.style.height = "calc(var(--profile-height) * 93%)"
    }
    setThemeColorStops(ranges, distances, grades, distance) {  
        this.routeColorStops = distances.map((x, i) => {
            let grade = grades[i]; 
            if (grade < -0.17 || grade > 0.25) { // sometimes a grade is an erronous extreme, instead take the average of the two entries on either side and use that
                grade = i > 0 && i < distances.length ? (grades[i - 1] + grades[i + 1]) / 2 : grades[i];
            }                 
            let color = interpolateColor(grade, ranges)
            //console.log(color.toString())              
            return {
                offset: x / distance,
                color: color,
            };
        });
    }
    setData(distances, elevations, grades, options={}) {
        this._distances = distances;
        this._elevations = elevations;
        options.reverse ? grades = grades.map(grade => -grade) : null;
        this._grades = grades;
        
        //console.log(grades)
        const distance = distances[distances.length - 1] - distances[0];
        this._yMax = Math.max(...elevations);
        this._yMin = Math.min(...elevations);
        // Echarts bug requires floor/ceil to avoid missing markLines
        this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
        //this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + 200));
        this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + this.yAxisMin)) + 5;
        const markLineData = [];
        if (this.showMaxLine) {
            const routeMaxElevation = Math.ceil(Math.max(...this.routeElevations));
            markLineData.push({
                type: 'max',
                lineStyle: {
                    width: this.lineSize, 
                    type: this.lineType,
                    color: this.lineTextColor
                },
                label: {
                    formatter: x => {
                        const viewMaxElevation = Math.ceil(x.value);
                        let output = [];
                        if (this.showCurrentAltitude) {
                            output.push(H.elevation(this.currentAltitude));
                        }
                        output.push(H.elevation(viewMaxElevation));
                        if (viewMaxElevation < routeMaxElevation && this.showRouteMaxElevation) {
                            output.push(H.elevation(routeMaxElevation));
                        }                        
                        return `${output.join(' / ')}m`;
                        //return viewMaxElevation < routeMaxElevation ? `${H.elevation(viewMaxElevation)} / ${H.elevation(routeMaxElevation, {suffix: true})}` : `${H.elevation(routeMaxElevation, {suffix: true})}`;
                    },
                    position: options.reverse ? 'insideStartTop' : 'insideEndTop',
                    color: this.lineTextColor,
                    rotate: 0
                },
            });
        }
        if (options.markLines) {
            options.markLines.sort((a,b) => {
                return a.xAxis - b.xAxis;
            })
            //console.log(options.markLines)

            markLineData.push(...options.markLines);
        }
        const markAreaData = [];
        let lineWidth = 1;
        if (this.colorScheme == "vv") {
            //console.log("Selected colorscheme is " + this.colorScheme)
            const green  = {min: 0.00, max: 0.025, hMin: 100, hMax: 60, s: 0.75, l: 0.5}
            const yellow = {min: 0.025, max: 0.085, hMin: 60, hMax: 40, s: 1, l: 0.5}
            const orange = {min: 0.085, max: 0.105, hMin: 39, hMax: 20, s: 1, l: 0.5}
            const red = {min: 0.105, max: 0.15, hMin: 19, hMax: 0, s: 1, l: 0.4}
            const angryred = {min: 0.15, max: 0.25, hMin: 1, hMax: 0, s: 1, l: 0.25}
            const lightblue = {min: -0.04, max: 0.00, hMin: 190, hMax: 175, s: 1, l: 0.5}
            const medblue = {min: -0.09, max: -0.04, hMin: 200, hMax: 190, s: 1, l: 0.5}
            const darkblue = {min: -0.17, max: -0.09, hMin: 250, hMax: 200, s: 1, l: 0.5}
            const allColors = [green, yellow, orange, red, angryred, lightblue, medblue, darkblue];
            lineWidth = 0;            
            this.routeColorStops = distances.map((x, i) => {
                let grade = grades[i]; 
                if (Math.abs(grade) > 0.12) {
                    let previousGrade = i > 0 ? grades[i - 1] : null;
                    let nextGrade = i < grades.length - 1 ? grades[i + 1] : null;
                    //console.log(grade, previousGrade, nextGrade)
                    if (previousGrade !== null && nextGrade !== null) {
                        if ((grade > 0 && previousGrade < 0.009 && nextGrade < 0.009) || (grade < 0 && previousGrade > -0.009 && nextGrade > -0.009)) {
                            //console.log("Discarding erronous grade entry, opposing polarity",i, grade, previousGrade, nextGrade)
                            grade = (grades[i - 1] + grades[i + 1]) / 2 // we have a grade >10% and the grade before and after are opposite polarity, it's probably an anomoly
                        }
                    }
                }
                if (grade < -0.17 || grade > 0.25) { // sometimes a grade is an erronous extreme, instead take the average of the two entries on either side and use that
                    grade = i > 0 && i < distances.length ? (grades[i - 1] + grades[i + 1]) / 2 : grades[i];
                }
                let selectedColor = allColors.filter(x => grade >= x.min && grade < x.max)            
                let color = Color.fromRGB(0,0,0)
                if (selectedColor.length > 0) {
                    color.h = getRelativeHue(grade,selectedColor) / 360
                    color.s = selectedColor[0].s;
                    color.l = selectedColor[0].l
                }                
                return {
                    offset: x / distance,
                    color: color.toString(),
                };
            });
            //debugger
       } else if (this.colorScheme == "cvdBuRd") {
            //console.log("Selected colorscheme is " + this.colorScheme)            
            const ranges = [
                {min: -0.5, r: 33, g: 102, b: 172}, // catch for extremes
                {min: -0.17, r: 67, g: 147, b: 195},
                {min: -0.09, r: 146, g: 197, b: 222},
                {min: -0.04, r: 209, g: 229, b: 240},
                {min: 0.00, r: 247, g: 247, b: 247},
                {min: 0.015, r: 253, g: 219, b: 199},
                {min: 0.055, r: 244, g: 165, b: 130},
                {min: 0.105, r: 214, g: 96, b: 77},
                {min: 0.17, r: 178, g: 24, b: 43},
                {min: 0.5, r: 255, g: 238, b: 153} // catch for extremes
            ];
            lineWidth = 0;
            this.setThemeColorStops(ranges, distances, grades, distance);
       } else if (this.colorScheme == "cvdPRGn") {
            //console.log("Selected colorscheme is " + this.colorScheme)               
            const ranges = [
                {min: -0.5, r: 118, g: 42, b: 131}, // catch for extremes
                {min: -0.17, r: 153, g: 112, b: 171},
                {min: -0.09, r: 194, g: 165, b: 207},
                {min: -0.04, r: 231, g: 212, b: 232},
                {min: 0.00, r: 247, g: 247, b: 247},
                {min: 0.015, r: 217, g: 240, b: 211},
                {min: 0.055, r: 172, g: 211, b: 158},
                {min: 0.105, r: 90, g: 174, b: 97},
                {min: 0.17, r: 27, g: 120, b: 55},
                {min: 0.5, r: 255, g: 238, b: 153} // catch for extremes
            ];
                
            lineWidth = 0;            
            this.setThemeColorStops(ranges, distances, grades, distance);
        } else if (this.colorScheme == "cvdSunset") {
            //console.log("Selected colorscheme is " + this.colorScheme)               
            const ranges = [
                {min: -0.5, r: 54, g: 75, b: 154}, // catch for extremes
                {min: -0.17, r: 74, g: 123, b: 183},
                {min: -0.09, r: 152, g: 202, b: 225},
                {min: -0.04, r: 194, g: 228, b: 239},
                {min: 0.00, r: 255, g: 255, b: 191},
                {min: 0.015, r: 254, g: 218, b: 139},
                {min: 0.055, r: 246, g: 126, b: 75},
                {min: 0.105, r: 221, g: 61, b: 45},
                {min: 0.17, r: 165, g: 0, b: 38},
                {min: 0.5, r: 255, g: 255, b: 255} // catch for extremes
            ];                
            lineWidth = 0;            
            this.setThemeColorStops(ranges, distances, grades, distance);
        } else {
            lineWidth = 1;
            this.routeColorStops = distances.map((x, i) => {
                const steepness = Math.abs(grades[i] / 0.12);            
                const color = Color.fromRGB(steepness, 0.4, 0.5 * steepness)
                    .lighten(-0.25)
                    .saturate(steepness - 0.33);                    
                return {
                    offset: x / distance,
                    color: color.toString(),
                };        
            });
        }              
        this.chart.setOption({
            xAxis: {inverse: options.reverse},
            yAxis: {
                min: this._yAxisMin,
                max: this._yAxisMax,
            },
            series: [{
                areaStyle: {
                    origin: 'start',
                    color:  {
                        type: 'linear',
                        x: options.reverse ? 1 : 0,
                        y: 0,
                        x2: options.reverse ? 0 : 1,
                        y2: 0,
                        colorStops: this.routeColorStops,
                    },
                    opacity: this.gradientOpacity
                },
                lineStyle: {
                    width: lineWidth
                },
                markLine: {data: markLineData},                
                data: distances.map((x, i) => [x, elevations[i], grades[i] * (options.reverse ? -1 : 1)]),
            }]
        });
        
    }

    findNodesIndex(roadSegmentData, origin, next, reverse, startIndex) {
        
        for (let i = 0; i < roadSegmentData.nodes.length; i++) {
            
            
            if (reverse)
            {             
                let reversedData = roadSegmentData.nodes.slice(0);   
                reversedData.reverse();
                const currentNode = reversedData[i];
                const nextNode = reversedData[i + 1];
                const prevNode = reversedData[i - 1];
                if (typeof prevNode !== 'undefined')
                {           
                    if (                        
                        this.compareProperties(currentNode.end, origin.end) &&            
                        this.compareProperties(currentNode.cp1, origin.cp1) &&
                        this.compareProperties(currentNode.cp2, origin.cp2)
                    )
                    {                        
                        return i - 1; // i - 1 seems to work better for reverse segments                        
                    }
                }
            }
            // Check if origin properties match
            else {
                const currentNode = roadSegmentData.nodes[i];
                if (
                    this.compareProperties(currentNode.end, origin.end) &&            
                    this.compareProperties(currentNode.cp1, origin.cp1) &&
                    this.compareProperties(currentNode.cp2, origin.cp2)
                ) {
                    return i; 
                    
                }
            }
        }
      
        return -1; // Return -1 if not found
    }

    findNodesFullIndex(roadSegmentData, origin, next, reverse, startIndex) {
        let routeDataToSearch;
        //console.log(roadSegmentData.nodes.toReversed());
        reverse ? routeDataToSearch = roadSegmentData.nodes.toReversed() : routeDataToSearch = roadSegmentData.nodes;   
        
        for (let i = 0; i < routeDataToSearch.length; i++) {            
            const currentNode = routeDataToSearch[i];
            const nextNode = routeDataToSearch[i + 1];
            ;
            if (
                this.compareProperties(currentNode.end, origin.end) &&            
                this.compareProperties(currentNode.cp1, origin.cp1) &&
                this.compareProperties(currentNode.cp2, origin.cp2)
            ) {
                console.log("Matched origin")
                ;
                if (                    
                    this.compareProperties(nextNode.end, next.end) &&            
                    this.compareProperties(nextNode.cp1, next.cp1) &&
                    this.compareProperties(nextNode.cp2, next.cp2)
                )
                {
                    console.log("Matched next")
                    return i; 
                }
                
            }
        }
        
      
        return -1; // Return -1 if not found
    }

    compareProperties(obj1, obj2) {
        if (!obj1 || !obj2) {
          return true; // If either object is undefined or null, consider them equal
        }
      
        return Object.keys(obj1).every((key) => obj2.hasOwnProperty(key) && obj1[key] === obj2[key]);
    }    
      
    async getPpRoute() {
        const groups = await common.rpc.getGroupsData();
        let watchingIndex;
        let groupAthletes;
        
        for (let  i = 0; i < groups.length; i++) {
            if (groups[i].watching === true) {
                watchingIndex = i;
                groupAthletes = groups[watchingIndex].athletes;
                break;
            }
        }
        let ppInGroup = groupAthletes.find(x => x.athlete.type == "PACER_BOT");
        if (ppInGroup) {
            //console.log("Found a PP! " + ppInGroup.athlete.lastName);            
            return ppInGroup.state.routeId;
        } 
        return false;
    }
    

    async renderAthleteStates(states, force) {
        if (this.watchingId == null || this._busy) {
            return;
        }
        this._busy = true;
        try {
            return await this._renderAthleteStates(states, force);
        } finally {
            this._busy = false;
        }
    }

    async _renderAthleteStates(states, force) {
        
        if (!states[0]) {
            return
        }        
        const watching = states.find(x => x.athleteId === this.watchingId); 
        //this.preferRoute = false // test to force elevation to road mode

        if (!watching && (this.courseId == null || (!this.road && !this.route))) {
            return;
        } else if (watching) {
            if (watching.courseId !== this.courseId || this.courseRoads == 0) {
                await this.setCourse(watching.courseId);
                this.courseRoads = await common.rpc.getRoads(watching.courseId);
            }
            const knownRoute = allRoutes.find(x => x.id == watching.routeId)
            //this.knownRoad = await common.rpc.getRoad(watching.courseId, watching.roadId)
            this.knownRoad = this.courseRoads?.find(x => x.id == watching.roadId);
            this.currentAltitude = watching.altitude;
            //debugger
            if (this.preferRoute) {
                if ((!watching.routeId && !this.routeOverride && (Date.now() - this.routeOverrideTS > 5000)) || (!watching.routeId && (Date.now() - this.routeOverrideTS > 5000)) || !knownRoute) {
                    //console.log("No route on watching, looking for a PP in group")
                    this.routeOverrideTS = Date.now();
                    this.routeOverride = await this.getPpRoute();
                }
                
                if ((watching.routeId && knownRoute) || this.routeOverride) {
                    
                    if (watching.routeId) {
                        this.routeOverride = false;
                    } 
                    if (this.routeOverride && (this.routeOverride != this.routeId)) {                        
                        console.log("Overriding routeId to: " + this.routeOverride)                        
                        await this.setRoute(this.routeOverride);
                    } else if (this.routeId !== watching.routeId ||
                        (this._eventSubgroupId || null) !== (watching.eventSubgroupId || null)) {
                        if (!this.routeOverride) {
                            let sg;
                            if (watching.eventSubgroupId) {
                                sg = await common.rpc.getEventSubgroup(watching.eventSubgroupId);
                                console.log(sg) 
                                //debugger
                                this.eventPowerups = zen.getEventPowerups(sg)
                                /* test dummy data for designated powerups at arches
                                this.eventPowerups = {
                                    type: "arch_powerup",
                                    powerups: {
                                        1: "aero",
                                        2: "burrito",
                                        3: "draft",
                                        4: "feather",
                                        0: "ghost"
                                    }
                                }
                                */
                                //console.log(this.eventPowerups)
                            } 
                            
                            // Note sg.routeId is sometimes out of sync with state.routeId; avoid thrash
                            
                            
                            this.deltas.length = 0;  // reset the delta averages 
                            this.routeOffset = 0;
                            this.lapCounter = 0;  
                              
                            if (this.overrideDistance > 0 || this.overrideLaps > 0) {
                                console.log("overridedistance: " + this.overrideDistance + " overridelaps: " + this.overrideLaps)
                                await this.setRoute(watching.routeId, {laps: this.overrideLaps, eventSubgroupId: watching.eventSubgroupId, distance: this.overrideDistance})
                            } else if (sg && sg.routeId === watching.routeId && sg.distanceInMeters) {                            
                                await this.setRoute(sg.routeId, {laps: sg.laps, eventSubgroupId: sg.id, distance: sg.distanceInMeters});
                            } else if (sg && sg.routeId === watching.routeId) {                            
                                await this.setRoute(sg.routeId, {laps: sg.laps, eventSubgroupId: sg.id});
                            } else if (!sg && watching.eventSubgroupId) {
                                // Sauce doesn't know about the event, either too old or could be something like a private meetup                            
                                await this.setRoute(watching.routeId, {laps: 1, eventSubgroupId: watching.eventSubgroupId})
                            }
                            else {                            
                                await this.setRoute(watching.routeId);
                            }
                        }
                    }
                    if (watching.laps != this.lapCounter && this.showLapMarker && watching.eventSubgroupId == 0 && this.showCompletedLaps) {                        
                        //if (this.routeId != null) { 
                            let chartMarkLines = [];
                            if (this.chart.getOption().series[0].markLine.data) {
                                chartMarkLines = this.chart.getOption().series[0].markLine.data
                            }
                            
                            if (chartMarkLines.length > 0) {
                                //console.log("Updating lap marker");                                
                                //let lapLabel = chartMarkLines.filter(x => x.label.formatter.indexOf("LAP") > -1)
                                let lapLabel = chartMarkLines.filter(function(line) {
                                    return line.type != "max" && line.label.formatter.slice(0,3) == "LAP"                                        
                                })
                                
                                if (lapLabel.length == 1) {
                                    let lapDisplay;
                                    watching.laps > 0 ? lapDisplay = watching.laps : lapDisplay = "";
                                    this.lapCounter = watching.laps;
                                    lapLabel[0].label.formatter = "LAP " + lapDisplay;
                                    this.chart.setOption({                            
                                        series: [{                                
                                            markLine: {data: chartMarkLines},                                                
                                        }]
                                    });
                                }
                            }
                        //}
                    }
                } else {
                    this.route = null;
                    this.routeId = null;
                }
                //console.log(this.customDistance, this.deltas.length)
                if (this.routeOffset) {
                    let currentDelta = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
                    //console.log(currentDelta, this.routeOffset)
                    if (currentDelta < (this.routeOffset - 10) || currentDelta > (this.routeOffset + 10)) {                        
                        console.log("Recalculating finish markLine")
                        // delta between xCoord and eventDistance has changed by more than 10m from last calculation so we will redraw the finish line
                        this.routeOffset = false;
                    } else {
                        
                    }
                }
                if (this.customDistance > 0 && this.deltas.length > 20 && !this.routeOffset && this.routeId != null)
                {
                    let sg;
                    if (watching.eventSubgroupId) {
                        sg = await common.rpc.getEventSubgroup(watching.eventSubgroupId);
                    }                    
                    this.routeOffset = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
                    console.log("Distance delta is: " + this.routeOffset)
                    await this.setRoute(sg.routeId, {laps: sg.laps, eventSubgroupId: sg.id, distance: this.customDistance});
                }
            }
            
            if (!this.routeId || !knownRoute && !this.routeOverride) {                
                if (this.knownRoad) {
                    
                    if (!this.road || this.road.id !== watching.roadId || this.reverse !== watching.reverse) {
                        let roadSegments = await zen.getRoadSegments(this.courseId, watching.roadId, watching.reverse)
                        console.log("Setting road to", watching.roadId, "reverse:", watching.reverse, "roadSegments", roadSegments)
                        this.setRoad(watching.roadId, watching.reverse, roadSegments);
                    }
                } else {
                    
                }
            }
        }
        //debugger
        if (this.knownRoad) {
            const now = Date.now();        
            for (const state of states) {
                if (!this.marks.has(state.athleteId)) {
                    this.marks.set(state.athleteId, {
                        athleteId: state.athleteId,
                        state,
                    });
                }
                const mark = this.marks.get(state.athleteId);
                mark.state = state;
                mark.lastSeen = now;
            }
            common.idle().then(() => this._updateAthleteDetails(states.map(x => x.athleteId)));
            if (!force && now - this._lastRender < this.refresh) {
                clearTimeout(this._refreshTimeout);
                this._refreshTimeout = setTimeout(
                    () => this.renderAthleteStates([]),
                    this.refresh - (now - this._lastRender));
                return;
            }
            if (!force && !common.isVisible()) {
                cancelAnimationFrame(this._visAnimFrame);
                this._visAnimFrame = requestAnimationFrame(() => this.renderAthleteStates([]));
                return;
            }
            this._lastRender = now;
            const marks = Array.from(this.marks.values()).filter(x => {
                const sig = `${x.state.roadId}-${!!x.state.reverse}`;
                //debugger
                const stateWatching = x.state.athleteId === this.watchingId;                                        
                if (!this._roadSigs.has(sig) && stateWatching) {
                    //console.log("We are on a road (" + sig + ") that isn't included in the route manifest")
                }
                return true;
                //debugger
                //return this._roadSigs.has(sig);
            });
            const markPointLabelSize = 0.4;
            const deltaY = this._yAxisMax - this._yAxisMin;
            const nodes = this.curvePath.nodes; 
            let watchingPinData = [];
            //debugger   
            this.chart.setOption({series: [{
                markPoint: {
                    itemStyle: {borderColor: '#222b'},
                    animation: false,
                    data: marks.map(({state}) => {                                        
                        let roadSeg;
                        let nodeRoadOfft;
                        let deemphasize;
                        const isWatching = (state.athleteId === this.watchingId);
                        let isTeamMate = false;
                        let isMarked = false;
                        let isPP = false;
                        let isBeacon = false;  
                        let isLeaderSweep = false;  
                        let isGroup = false;                
                        let beaconColour;
                        let beaconData = {};
                        const ad = common.getAthleteDataCacheEntry(state.athleteId);
                        if (state.isGroup) {
                            isGroup = true;
                        } else {
                            if (ad && ad.athlete && ad.athlete.team) {
                                isWatching ? this.watchingTeam = ad.athlete.team : 
                                ad.athlete.team == this.watchingTeam ? isTeamMate = true : null;   
                                //debugger                     
                            } 
                            if (ad && ad.athlete && ad.athlete.marked && !isWatching) {
                                isMarked = true;
                            }
                            if (ad && ad.athlete && ad.athlete.type == "PACER_BOT" && ad.state.sport == "cycling" && !isWatching && this.showRobopacers) {
                                isPP = true;
                                isBeacon = true;
                                let wkg = ad.state.power / ad.athlete.weight;
                                beaconColour = wkg <= 2.0 ? "#ffff00" : (wkg > 2.0 && wkg <= 3.0) ? "#00ffff" : (wkg > 3.0 && wkg < 4.0) ? "#00ff40" : "#ff0000"
                                if (this.showRobopacersGap && !beaconSubs.find(x => x.athleteId == state.athleteId)) {
                                    console.log("Found a beacon, subscribing to ", state.athleteId)
                                    beaconSubs.push({
                                        athleteId: state.athleteId,
                                        ts: Date.now(),
                                        data: {}
                                    })
                                    common.subscribe("athlete/" + state.athleteId, beacon => {
                                        //console.log("beacon", beacon)
                                        const thisBeacon = beaconSubs.find(x => x.athleteId == beacon.athleteId)
                                        thisBeacon.data = beacon;
                                    })
                                }
                                //beaconData = common.getAthleteDataCacheEntry(state.athleteId)
                                beaconData = beaconSubs.find(x => x.athleteId == state.athleteId)
                                //debugger
                                //console.log("found a PP mark")
                            }
                            if (ad && (ad.eventLeader || ad.eventSweeper) && this.showLeaderSweep) {                        
                                isLeaderSweep = true;
                                isBeacon = true;
                                ad.eventLeader ? beaconColour = "yellow" : null;
                                ad.eventSweeper ? beaconColour = "red" : null;
                            }
                        }
                        //to do - restructure to check options and state status                    
                        //if (isWatching || !this.showMyPin) { 
                        if ((this.showMyPin && isWatching) || 
                            this.showAllRiders ||
                            (this.showTeamMembers && isTeamMate) ||
                            (this.showMarkedRiders && isMarked) ||
                            (this.showRobopacers && isPP) || 
                            (this.showLeaderSweep && isLeaderSweep)
                        ) {        
                            
                            if (this.routeId != null) {                                
                                
                                //console.log("route not null")
                                if (state.routeId === this.routeId) {
                                    let distance;
                                    if (this._eventSubgroupId != null) {
                                        deemphasize = state.eventSubgroupId !== this._eventSubgroupId;
                                        if (this.routeInfo.routeFullData.paddockExitOffset) {
                                            //route has an offset due to a paddock exit road not included in eventDistance
                                            distance = state.eventDistance + this.routeInfo.routeFullData.paddockExitOffset
                                            //distance = state.eventDistance;
                                        } else {
                                            distance = state.eventDistance;
                                        }
                                    
                                    } else {
                                        // Outside of events state.progress represents the progress of single lap.
                                        // However, if the lap counter is > 0 then the progress % does not include
                                        // leadin.
                                        const floor = state.laps ? this._routeLeadinDistance : 0;
                                        const totDist = this._distances[this._distances.length - 1];
                                        distance = state.progress * (totDist - floor) + floor;
                                    }                                    
                                    let nearIdx = common.binarySearchClosest(this._distances, distance);
                                    //debugger
                                    if (this._eventSubgroupId != null && nearIdx < this.routeInfo.routeFullData.lapNodes[state.laps]) {
                                        //console.log("Bumping idx",nearIdx," to next lap", this.routeInfo.routeFullData.lapNodes[state.laps])
                                        //debugger
                                        nearIdx = this.routeInfo.routeFullData.lapNodes[state.laps]
                                    }
                                    if (typeof nodes[nearIdx] === 'undefined') {
                                        //debugger
                                        console.log("nodes[nearIdx] is undefined!")
                                    }
                                    const nearRoadSegIdx = nodes[nearIdx].index;
                                    //debugger
                                    // NOTE: This technique does not work for bots or people who joined a bot.
                                    // I don't know why but progress and eventDistance are completely wrong.
                                    roadSearch:
                                    for (let offt = 0; offt < 12; offt++) {
                                        for (const dir of [1, -1]) {
                                            const segIdx = nearRoadSegIdx + (offt * dir);
                                            const s = this.route.roadSegments[segIdx];
                                            if (s && s.roadId === state.roadId && !!s.reverse === !!state.reverse &&
                                                s.includesRoadTime(state.roadTime)) {
                                                roadSeg = s;
                                                this.foundRouteRoadseg = true;
                                                // We found the road segment but need to find the exact node offset
                                                // to support multi-lap configurations...
                                                for (let i = nearIdx; i >= 0 && i < nodes.length; i += dir) {
                                                    if (nodes[i].index === segIdx) {
                                                        // Rewind to first node of this segment.
                                                        while (i > 0 && nodes[i - 1].index === segIdx) {
                                                            i--;
                                                        }
                                                        nodeRoadOfft = i;
                                                        break;
                                                    }
                                                }
                                                break roadSearch;
                                            }
                                        }
                                    }
                                }
                                if (!roadSeg) {
                                    // Not on our route but might be nearby..
                                    
                                    const i = this.route.roadSegments.findIndex(x =>
                                        x.roadId === state.roadId &&
                                        !!x.reverse === !!state.reverse &&
                                        x.includesRoadTime(state.roadTime));
                                    if (i === -1) {
                                        
                                        //return null;
                                    }
                                    roadSeg = this.route.roadSegments[i];
                                    nodeRoadOfft = nodes.findIndex(x => x.index === i);
                                    deemphasize = true;
                                }
                            } else if (this.road && this.road.id === state.roadId) {
                                roadSeg = this.road.curvePath;
                                nodeRoadOfft = 0;
                            }
                            if (!roadSeg) {
                                //console.log("No roadseg found")
                                //debugger
                                //return null;
                            }
                            //debugger
                            let xCoord;
                            let yCoord;
                            let xIdx;
                            if (roadSeg) {
                                this.foundRoute = true;
                                const bounds = roadSeg.boundsAtRoadTime(state.roadTime);
                                const nodeOfft = roadSeg.reverse ?
                                    roadSeg.nodes.length - 1 - (bounds.index + bounds.percent) :
                                    bounds.index + bounds.percent;
                                xIdx = nodeRoadOfft + nodeOfft;
                                if (xIdx < 0 || xIdx > this._distances.length - 1) {
                                    //console.log(this._distances)
                                    console.error("route index offset bad!", {xIdx});
                                    return null;
                                }
                                
                                //let xCoord;
                                //let yCoord;
                                if (xIdx % 1) {
                                    const i = xIdx | 0;
                                    const dDelta = this._distances[i + 1] - this._distances[i];
                                    const eDelta = this._elevations[i + 1] - this._elevations[i];
                                    xCoord = this._distances[i] + dDelta * (xIdx % 1);
                                    yCoord = this._elevations[i] + eDelta * (xIdx % 1);
                                    //debugger
                                } else {
                                    xCoord = this._distances[xIdx];
                                    yCoord = this._elevations[xIdx];
                                }
                                if (isNaN(xCoord) || xCoord == null) {
                                    console.error('xCoord is NaN or null');
                                    //debugger
                                }
                            } else if (isWatching && this.foundRoute) {
                                let routeOffset;
                                if (this.deltas.length > 15) {
                                    routeOffset = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length;
                                    //console.log("Calculated route offset to " + routeOffset)
                                } else {
                                    routeOffset = 0;
                                    //console.log("No route offset found")
                                }
                                if (state.eventDistance > 0) {
                                    xCoord = state.eventDistance - routeOffset;
                                    let idxGuess = common.binarySearchClosest(this.routeDistances, (state.eventDistance - routeOffset));
                                    const dDelta = this.routeDistances[idxGuess + 1] - this.routeDistances[idxGuess];
                                    const idxDelta = 1 - ((this.routeDistances[idxGuess + 1] - xCoord) / dDelta);
                                    const eDelta = this.routeElevations[idxGuess + 1] - this.routeElevations[idxGuess];
                                    yCoord = this.routeElevations[idxGuess] + (eDelta * idxDelta);
                                    //yCoord = 287.27796358066405; // just a test
                                    xIdx = 0;
                                    //console.log("xCoord is " + xCoord + " yCoord is " + yCoord)
                                    //debugger
                                } else {
                                    //console.log("waiting for eventDistance > 0 before setting xCoord")
                                    xCoord = null;
                                }
                            }
                            /*if (isWatching) {
                                // XXX
                                console.log("got it", xCoord, xIdx, state.roadId, state.reverse, state.roadTime,
                                            {nodeRoadOfft, nodeOfft, reverse: state.reverse});
                            }*/
                            let allOtherPins = this.showMyPin;
                            this.showMyPin ? allOtherPins = 1 : allOtherPins = 1;
                            let watchingPinSize = 1.1 * this.pinSize;
                            let groupPinSize = 0.55 * this.pinSize;
                            let teamPinSize = 0.75 * this.pinSize;
                            let deemphasizePinSize = 0.35 * this.pinSize * allOtherPins;
                            let otherPinSize = 0.55 * this.pinSize * allOtherPins;
                            let watchingPinColor = this.pinColor;
                            let markedPinColor = this.pinColorMarked;
                            //console.log(allOtherPins)
                            
                            if (isWatching && this.showMyPin)
                            {                       
                                if (this.debugXcoord) {
                                    console.log("Debug xCoord:", this.debugXcoordDistance)
                                    //xCoord = typeof(xCoord) == "number" ? this.debugXcoordDistance : 0;
                                    if (typeof(xCoord) == "number") {
                                        xCoord = this.debugXcoordDistance;                                        
                                        //debugger
                                    } else 
                                    {
                                        xCoord = 0;                                        
                                    }
                                    yCoord = this.routeElevations[common.binarySearchClosest(this.routeDistances, xCoord)]
                                }
                                if (this.currentLap != state.laps + 1 && state.eventSubgroupId != 0) {
                                    //console.log("Setting current lap to: " + (state.laps + 1))
                                    this.currentLap = state.laps + 1;
                                    let leadinNodesCount = 0;
                                    let leadin = this.routeInfo.routeFullData.roadSegments.filter(x => x.leadin)
                                    if (leadin.length > 0) {                
                                        for (let rs of leadin) {
                                            leadinNodesCount += rs.nodes.length;
                                        }
                                    }
                                    let lapCurvePath = this.routeInfo.routeFullData.roadSegments.filter(x => (x.lap == 1 && !x.leadin))
                                    let lapNodesCount = 0;
                                    for (let rs of lapCurvePath) {
                                        lapNodesCount += rs.nodes.length;
                                    }
                                    let lapStart;
                                    let lapFinish;
                                    if (this.currentLap == 1) {
                                        lapStart = 0;
                                        lapFinish = leadinNodesCount + lapNodesCount;
                                    } else {
                                        lapStart = leadinNodesCount + (lapNodesCount * (this.currentLap - 1));
                                        lapFinish = lapStart + lapNodesCount;
                                    }
                                    
                                    if (this.singleLapView) {                                    
                                        const distance = this.routeDistances[lapFinish - 1] - this.routeDistances[lapStart];                                    
                                        const dataZoomData = [];
                                        const dataZoomColorStops = Array.from(this.routeColorStops.slice(lapStart, lapFinish));                                    
                                        const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                            offset: (this.routeDistances[lapStart + i] - this.routeDistances[lapStart]) / distance,
                                            color: stop.color
                                        }))   
                                        const zoomStart = this.routeDistances[lapStart];
                                        const zoomFinish = this.routeDistances[lapFinish];
                                        dataZoomData.push({
                                            type: 'inside',
                                            startValue: zoomStart,
                                            endValue: zoomFinish
                                        })
                                        this.chart.setOption({
                                            dataZoom: dataZoomData[0],
                                            series: [{
                                                areaStyle: {
                                                    color: {
                                                        colorStops: newColorStops
                                                    },
                                                    opacity: this.gradientOpacity
                                                }
                                            }]                                        
                                        })
                                        this.scaleXaxis(zoomStart, zoomFinish)
                                    }
                                    //debugger
                                }
                                if (this.profileZoom && !this.singleLapView && ((this.forwardDistance < this.routeDistances.at(-1)) || this.zoomRemainingRoute)) {
                                    //console.log(xCoord)
                                    let offsetBack = this.behindDistance || 500;
                                    let distance;
                                    if (this.zoomRemainingRoute) {
                                        if (state.eventDistance > 0 && xCoord) {
                                            if (this.routeDistances.at(-1) - xCoord > 1000) {
                                                distance = this.routeDistances.at(-1) - xCoord;
                                            } else {
                                                distance = 1000;
                                            }
                                        } else {
                                            distance = this.routeDistances.at(-1)
                                        }
                                    } else {
                                        distance = this.forwardDistance; 
                                    }
                                    let zoomStart;
                                    let zoomFinish;
                                    let approachingFinish = false
                                    if (xCoord - offsetBack > 0 && typeof(xCoord) != "undefined") {
                                        let zoomIdx = common.binarySearchClosest(this.routeDistances, (xCoord - offsetBack))
                                        //zoomStart = xCoord - 500;
                                        zoomStart = this.routeDistances[zoomIdx]
                                    } else {
                                        zoomStart = 0;
                                    }
                                    if (xCoord + distance < this.routeDistances.at(-1) && typeof(xCoord) != "undefined") {
                                        let zoomIdx = common.binarySearchClosest(this.routeDistances, (xCoord + distance))
                                        //zoomFinish = xCoord + distance;                
                                        zoomFinish = this.routeDistances[zoomIdx]
                                    } else if (typeof(xCoord) == "undefined") {
                                        //console.log("XCoord is undefined")
                                        zoomFinish = distance;
                                        zoomStart = 0;
                                    } else {
                                        zoomFinish = this.routeDistances.at(-1);
                                        zoomStart = zoomFinish - distance - offsetBack
                                        approachingFinish = true
                                    }
                                    let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                    let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish));
                                    if (this.zoomIdx.start != idxStart || this.zoomIdx.finish != idxFinish) {                                    
                                        this.zoomIdx = {
                                            start: idxStart,
                                            finish: idxFinish
                                        };
                                        const viewElevations = this.routeElevations.slice(idxStart, idxFinish);
                                        let viewMin = Math.floor(Math.min(...viewElevations) - 5)
                                        let viewMax = Math.ceil(Math.max(...viewElevations, this.yAxisMin) + 5)
                                        //console.log("viewMin", viewMin, "viewMax", viewMax)
                                        //debugger
                                        if (approachingFinish) {
                                            zoomStart = this.routeDistances.at(-(this.routeDistances.length - idxStart)) // adjust the zoom offset to line up with colorstops
                                        }
                                        const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));                                    
                                        const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                            offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance + offsetBack),
                                            color: stop.color
                                        })) 
                                        //console.log(newColorStops)
                                        const dataZoomData = [];                                                              
                                        dataZoomData.push({
                                            type: 'inside',
                                            startValue: zoomStart,
                                            endValue: zoomFinish
                                        })
                                        this.chart.setOption({
                                            dataZoom: dataZoomData[0], 
                                            series: [{
                                                areaStyle: {
                                                    color: {
                                                        colorStops: newColorStops
                                                    },
                                                    opacity: this.gradientOpacity
                                                }
                                            }],
                                            yAxis: {
                                                min: viewMin,
                                                max: viewMax
                                            }   
                                        })
                                        this.scaleXaxis(zoomStart, zoomFinish)
                                    }
                                    //debugger
                                } else if (this.zoomNextSegment && !this.singleLapView) {
                                    let fullSegments = allMarkLines.filter(x => !x.finishArchOnly);
                                    let nextSegmentIdx = zen.getNextSegment(fullSegments, xCoord)
                                    let nextSegment = fullSegments[nextSegmentIdx]
                                    //let nextSegment = zen.getNextSegment(allMarkLines, xCoord)
                                    //console.log("next segment", nextSegment)
                                    //TODO: fix zoom next segment + show final km combo when in the pen
                                    if (nextSegment != -1) {
                                        let segmentMarkLines = allMarkLines.filter(x => x.id == nextSegment.id && x.repeat == nextSegment.repeat)
                                        let segmentStart = segmentMarkLines[0];
                                        let segmentFinish = segmentMarkLines[1];
                                        //debugger
                                        if (this.zoomSegmentOnlyWithinApproach && (segmentStart.markLine - xCoord < this.zoomNextSegmentApproach) || !this.zoomSegmentOnlyWithinApproach) {
                                            //console.log("we are within the segment approach distance, zoom in!")
                                            
                                            let zoomStart;
                                            let zoomFinish;
                                            if (segmentStart.markLine - 500 > 0) {
                                                let zoomIdx = common.binarySearchClosest(this.routeDistances, (segmentStart.markLine - this.zoomNextSegmentApproach))
                                                //zoomStart = xCoord - 500;
                                                zoomStart = this.routeDistances[zoomIdx]
                                            } else {
                                                zoomStart = 0;
                                            }
                                            if (segmentFinish.markLine + 200 < this.routeDistances.at(-1)) {
                                                let zoomIdx = common.binarySearchClosest(this.routeDistances, (segmentFinish.markLine + 100))
                                                //zoomFinish = xCoord + distance;                
                                                zoomFinish = this.routeDistances[zoomIdx]
                                            } else {
                                                zoomFinish = this.routeDistances.at(-1);                                        
                                            }

                                            let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                            let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish));
                                            if (this.zoomIdx.start != idxStart || this.zoomIdx.finish != idxFinish) {
                                                this.zoomIdx = {
                                                    start: idxStart,
                                                    finish: idxFinish
                                                }; 
                                                let segmentElevations = this.routeElevations.slice(idxStart, idxFinish)                                    
                                                //console.log(segmentElevations)
                                                let segmentMin = Math.floor(Math.min(...segmentElevations) - 5)
                                                let segmentMax = Math.ceil(Math.max(...segmentElevations) + 5)
                                                //console.log("Min elev: " + segmentMin + " Max elev: " + segmentMax)
                                                //debugger
                                                const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));
                                                const distance = (segmentFinish.markLine + 100) - (segmentStart.markLine - this.zoomNextSegmentApproach)                                    
                                                const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                                    offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance), // fix distance colorstops
                                                    color: stop.color
                                                })) 
                                                //console.log(newColorStops)
                                                const dataZoomData = [];                                                              
                                                dataZoomData.push({
                                                    type: 'inside',
                                                    startValue: zoomStart,
                                                    endValue: zoomFinish
                                                })
                                                this.chart.setOption({
                                                    dataZoom: dataZoomData[0], 
                                                    series: [{
                                                        areaStyle: {
                                                            color: {
                                                                colorStops: newColorStops
                                                            },
                                                            opacity: this.gradientOpacity
                                                        }
                                                    }],
                                                    yAxis: {
                                                        min: segmentMin,
                                                        max: segmentMax
                                                    }                                                                          
                                                })
                                                this.zoomedIn = true;
                                                this.scaleXaxis(zoomStart, zoomFinish);
                                            }
                                        } else if (this.zoomedIn) {
                                            //zoom back out
                                            //console.log("Segment complete, zoom back out")
                                            this.zoomedIn = false;
                                            let zoomStart = this.routeDistances.at(0);
                                            let zoomFinish = this.routeDistances.at(-1);
                                            let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                            let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish)); 
                                            let elevations = this.routeElevations.slice(idxStart, idxFinish)                                    
                                            //console.log(segmentElevations)
                                            //let segmentMin = Math.floor(Math.min(...segmentElevations) - 5)
                                            //let segmentMax = Math.ceil(Math.max(...segmentElevations) + 5)
                                            this._yMax = Math.max(...elevations);
                                            this._yMin = Math.min(...elevations);
                                            this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
                                            this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + this.yAxisMin)) + 5;
                                            //console.log("Min elev: " + segmentMin + " Max elev: " + segmentMax)
                                            //debugger
                                            const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));
                                            const distance = zoomFinish - zoomStart;
                                            const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                                offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance), // fix distance colorstops
                                                color: stop.color
                                            })) 
                                            //console.log(newColorStops)
                                            const dataZoomData = [];                                                              
                                            dataZoomData.push({
                                                type: 'inside',
                                                startValue: zoomStart,
                                                endValue: zoomFinish
                                            })
                                            this.chart.setOption({
                                                dataZoom: dataZoomData[0], 
                                                series: [{
                                                    areaStyle: {
                                                        color: {
                                                            colorStops: newColorStops
                                                        },
                                                        opacity: this.gradientOpacity
                                                    }
                                                }],
                                                yAxis: {
                                                    min: this._yAxisMin,
                                                    max: this._yAxisMax
                                                }                                                                          
                                            })
                                            this.scaleXaxis(zoomStart, zoomFinish);
                                        }
                                        //debugger
                                    } else if (this.zoomFinalKm && !isNaN(xCoord)) {
                                        //console.log("Zoom final km")
                                        if ((this.zoomSegmentOnlyWithinApproach && ((this.routeDistances.at(-1) - 1000 - xCoord) < this.zoomNextSegmentApproach)) || !this.zoomSegmentOnlyWithinApproach) {
                                            //console.log("Zoom final km")
                                            let zoomStart = this.zoomSegmentOnlyWithinApproach ? this.routeDistances.at(-1) - 1000 - this.zoomNextSegmentApproach : this.routeDistances.at(-1) - 1000;
                                            let zoomFinish = this.routeDistances.at(-1);
                                            let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                            let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish)); 
                                            if (this.zoomIdx.start != idxStart || this.zoomIdx.finish != idxFinish) {
                                                this.zoomIdx = {
                                                    start: idxStart,
                                                    finish: idxFinish
                                                };
                                                let segmentElevations = this.routeElevations.slice(idxStart, idxFinish)                                    
                                                //console.log(segmentElevations)
                                                let segmentMin = Math.floor(Math.min(...segmentElevations) - 5)
                                                let segmentMax = Math.ceil(Math.max(...segmentElevations) + 5)
                                                //console.log("Min elev: " + segmentMin + " Max elev: " + segmentMax)
                                                //debugger
                                                const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));
                                                const distance = zoomFinish - zoomStart;
                                                const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                                    offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance), // fix distance colorstops
                                                    color: stop.color
                                                })) 
                                                //console.log(newColorStops)
                                                const dataZoomData = [];                                                              
                                                dataZoomData.push({
                                                    type: 'inside',
                                                    startValue: zoomStart,
                                                    endValue: zoomFinish
                                                })
                                                this.chart.setOption({
                                                    dataZoom: dataZoomData[0], 
                                                    series: [{
                                                        areaStyle: {
                                                            color: {
                                                                colorStops: newColorStops
                                                            },
                                                            opacity: this.gradientOpacity
                                                        }
                                                    }],
                                                    yAxis: {
                                                        min: segmentMin,
                                                        max: segmentMax
                                                    }                                                                          
                                                })
                                                this.zoomedIn = true;
                                                this.scaleXaxis(zoomStart, zoomFinish);
                                            }
                                        } else {
                                            this.zoomedIn = false;
                                            let zoomStart = this.routeDistances.at(0);
                                            let zoomFinish = this.routeDistances.at(-1);
                                            let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                            let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish)); 
                                            if (this.zoomIdx.start != idxStart || this.zoomIdx.finish != idxFinish) {
                                                this.zoomIdx = {
                                                    start: idxStart,
                                                    finish: idxFinish
                                                };
                                                let elevations = this.routeElevations.slice(idxStart, idxFinish)                                    
                                                //console.log(segmentElevations)
                                                //let segmentMin = Math.floor(Math.min(...segmentElevations) - 5)
                                                //let segmentMax = Math.ceil(Math.max(...segmentElevations) + 5)
                                                this._yMax = Math.max(...elevations);
                                                this._yMin = Math.min(...elevations);
                                                this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
                                                this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + this.yAxisMin)) + 5;
                                                //console.log("Min elev: " + segmentMin + " Max elev: " + segmentMax)
                                                //debugger
                                                const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));
                                                const distance = zoomFinish - zoomStart;
                                                const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                                    offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance), // fix distance colorstops
                                                    color: stop.color
                                                })) 
                                                //console.log(newColorStops)
                                                const dataZoomData = [];                                                              
                                                dataZoomData.push({
                                                    type: 'inside',
                                                    startValue: zoomStart,
                                                    endValue: zoomFinish
                                                })
                                                this.chart.setOption({
                                                    dataZoom: dataZoomData[0], 
                                                    series: [{
                                                        areaStyle: {
                                                            color: {
                                                                colorStops: newColorStops
                                                            },
                                                            opacity: this.gradientOpacity
                                                        }
                                                    }],
                                                    yAxis: {
                                                        min: this._yAxisMin,
                                                        max: this._yAxisMax
                                                    }                                                                          
                                                })
                                                this.scaleXaxis(zoomStart, zoomFinish);
                                            }
                                        }
                                    } else if (this.zoomedIn) {
                                        //zoom back out
                                        //console.log("No more segments, zoom back out")
                                        this.zoomedIn = false;
                                        let zoomStart = this.routeDistances.at(0);
                                        let zoomFinish = this.routeDistances.at(-1);
                                        let idxStart = common.binarySearchClosest(this.routeDistances, (zoomStart)); 
                                        let idxFinish = common.binarySearchClosest(this.routeDistances, (zoomFinish)); 
                                        if (this.zoomIdx.start != idxStart || this.zoomIdx.finish != idxFinish) {
                                            this.zoomIdx = {
                                                start: idxStart,
                                                finish: idxFinish
                                            };
                                            let elevations = this.routeElevations.slice(idxStart, idxFinish)                                    
                                            //console.log(segmentElevations)
                                            //let segmentMin = Math.floor(Math.min(...segmentElevations) - 5)
                                            //let segmentMax = Math.ceil(Math.max(...segmentElevations) + 5)
                                            this._yMax = Math.max(...elevations);
                                            this._yMin = Math.min(...elevations);
                                            this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
                                            this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + this.yAxisMin)) + 5;
                                            //console.log("Min elev: " + segmentMin + " Max elev: " + segmentMax)
                                            //debugger
                                            const dataZoomColorStops = Array.from(this.routeColorStops.slice(idxStart, idxFinish));
                                            const distance = zoomFinish - zoomStart;
                                            const newColorStops = dataZoomColorStops.map((stop, i) => ({
                                                offset: (this.routeDistances[idxStart + i] - this.routeDistances[idxStart]) / (distance), // fix distance colorstops
                                                color: stop.color
                                            })) 
                                            //console.log(newColorStops)
                                            const dataZoomData = [];                                                              
                                            dataZoomData.push({
                                                type: 'inside',
                                                startValue: zoomStart,
                                                endValue: zoomFinish
                                            })
                                            this.chart.setOption({
                                                dataZoom: dataZoomData[0], 
                                                series: [{
                                                    areaStyle: {
                                                        color: {
                                                            colorStops: newColorStops
                                                        },
                                                        opacity: this.gradientOpacity
                                                    }
                                                }],
                                                yAxis: {
                                                    min: this._yAxisMin,
                                                    max: this._yAxisMax
                                                }                                                                          
                                            })
                                            this.scaleXaxis(zoomStart, zoomFinish);
                                        }
                                    }
                                    
                                }
                                //console.log(allMarkLines)
                                let nextSegmentIdx = zen.getNextSegment(allMarkLines, xCoord) 
                                let nextSegment = nextSegmentIdx != -1 ? allMarkLines[nextSegmentIdx] : -1;
                                let nextSegmentFinish;                                
                                //console.log("nextSegment", nextSegment, "nextSegmentFinish", nextSegmentFinish)  
                                //debugger                         
                                let distanceToGo;
                                let distanceToGoFinish;
                                let distanceToGoUnits;
                                if (this.showNextSegment && (this.showSegmentStart || this.showAllArches))
                                {
                                    let nextSegmentDiv = document.getElementById('nextSegmentDiv');
                                    if (nextSegment != -1)
                                    {                                        
                                        let puImgs = "";
                                        if (this._eventSubgroupId && this.showNextPowerup && nextSegment.type != "custom") {
                                            //debugger
                                            
                                            if (this.eventPowerups.type == "powerup_percent") {                                                
                                                puImgs += "&nbsp;"
                                                for (let key in this.eventPowerups.powerups) {
                                                    puImgs += `<img src="./images/${key}.png" class="puImg">`
                                                }
                                            } else if (this.eventPowerups.type == "arch_powerup") {
                                                let nextArchId = nextSegment.archId || 0;
                                                puImgs += "&nbsp;"  
                                                if (this.eventPowerups.powerups[nextArchId]) {
                                                    puImgs += `<img src="./images/${this.eventPowerups.powerups[nextArchId]}.png" class="puImg">`
                                                } else {
                                                    puImgs += '&nbsp<img src="./images/smallXP.png" class="puImg">'
                                                }
                                            } else if (this.eventPowerups.type == "nopowerups") {
                                                puImgs += '&nbsp<img src="./images/smallXP.png" class="puImg">'
                                            } else if (this.eventPowerups.type == "standard") {
                                                puImgs += '&nbsp;<img src="./images/aero.png" class="puImg"><img src="./images/feather.png" class="puImg"><img src="./images/draft.png" class="puImg">'
                                            } 
                                            //debugger
                                        }

                                        const distToNextSegment = nextSegment.markLine - xCoord;
                                        let distToNextSegmentFinish = null;
                                        if (this.showNextSegmentFinish && nextSegment != -1 && !nextSegment.name.includes("Finish")) {
                                            nextSegmentFinish = allMarkLines[nextSegmentIdx + 1];
                                            distToNextSegmentFinish =  nextSegmentFinish.markLine - xCoord;  
                                        }
                                        //debugger                                                                              
                                        if (locale.isImperial()) {
                                            const metersPerMile = 1000 / locale.milesPerKm
                                            if (distToNextSegment > metersPerMile) {
                                                distanceToGo = (distToNextSegment / 1000 * locale.milesPerKm).toFixed(2)
                                                distanceToGoFinish = this.showNextSegmentFinish && distToNextSegmentFinish ? (distToNextSegmentFinish / 1000 * locale.milesPerKm).toFixed(2) : ""
                                                distanceToGoUnits = "mi"
                                                this.refresh = 1000;
                                            } else {
                                                distanceToGo = (distToNextSegment * locale.feetPerMeter).toFixed(0)
                                                distanceToGoFinish = this.showNextSegmentFinish && distToNextSegmentFinish ? (distToNextSegmentFinish * locale.feetPerMeter).toFixed(0) : ""
                                                distanceToGoUnits = "ft"
                                                this.refresh = 200;
                                            }
                                        } else {
                                            nextSegment.markLine - xCoord > 1000 ? distanceToGo = ((distToNextSegment) / 1000).toFixed(2) : distanceToGo = (distToNextSegment).toFixed(0);
                                            if (distToNextSegmentFinish != null) {
                                                nextSegment.markLine - xCoord > 1000 ? distanceToGoFinish = ((distToNextSegmentFinish) / 1000).toFixed(2) : distanceToGoFinish = (distToNextSegmentFinish).toFixed(0);
                                            } else {
                                                distanceToGoFinish = "";
                                            }
                                            distanceToGoUnits = distToNextSegment > 1000 ? "km" : "m";
                                            distanceToGo > 1000 ? this.refresh = 1000 : this.refresh = 200;
                                        }
                                        //debugger
                                        let nextName = nextSegment.name;
                                        if (nextSegment.finishArchOnly) {
                                            nextName = nextSegment.name.replace("Finish", "Arch")
                                        }
                                        if (this.showNextSegmentFinish && distToNextSegmentFinish != null) {
                                            nextSegmentDiv.innerHTML = (nextSegment.displayName ?? nextName) + ": " + distanceToGo + " / " + distanceToGoFinish + distanceToGoUnits + puImgs;
                                        } else {
                                            nextSegmentDiv.innerHTML = (nextSegment.displayName ?? nextName) + ": " + distanceToGo + distanceToGoUnits + puImgs;
                                        }
                                        //debugger
                                        nextSegmentDiv.style.visibility = "";
                                    }
                                    else
                                    {                                
                                        nextSegmentDiv.innerHTML = "";
                                        nextSegmentDiv.style.visibility = "hidden";
                                    }
                                }
                                else
                                {
                                    this.refresh < 1000 ? this.refresh = 1000 : this.refresh = 1000;
                                    let nextSegmentDiv = document.getElementById('nextSegmentDiv');
                                    nextSegmentDiv.innerHTML = "";
                                    nextSegmentDiv.style.visibility = "hidden";                     
                                }
                                //console.log("xCoord is", xCoord)
                                this.watchingPosition = xCoord;
                                if (this.setAthleteSegmentData)
                                {
                                    
                                    nextSegment.markLine - xCoord > 1000 ? distanceToGo = parseFloat((nextSegment.markLine - xCoord) / 1000).toFixed(2) : distanceToGo = parseFloat(nextSegment.markLine - xCoord).toFixed(0);
                                    nextSegment.markLine - xCoord > 1000 ? distanceToGoUnits = "km" : distanceToGoUnits = "m";
                                    nextSegment.markLine - xCoord > 1000 ? this.refresh = 1000 : this.refresh = 200;
                                    nextSegment == -1 ? this.refresh = 1000 : "";
                                    const routeSegments = allMarkLines;
                                    //console.log(routeSegments)
                                    let nextSegmentName;
                                    let nextSegmentDistanceToGo;
                                    let nextSegmentDisplayName;                            
                                    if (nextSegment.name) {
                                        nextSegmentName = nextSegment.name;
                                        nextSegmentDistanceToGo = distanceToGo;
                                        nextSegmentDisplayName = nextSegment.displayName ?? null;
                                    } else {
                                        //debugger
                                        nextSegmentName = "Finish";
                                        if ((this.routeDistances.at(-1) - xCoord) > 1000) {
                                            nextSegmentDistanceToGo = parseFloat(((this.routeDistances.at(-1) - xCoord) / 1000)).toFixed(2)
                                            distanceToGoUnits = "km"
                                        } else {
                                            nextSegmentDistanceToGo = parseFloat((this.routeDistances.at(-1) - xCoord)).toFixed(0)
                                            distanceToGoUnits = "m"
                                        }
                                        
                                    }
                                    //debugger
                                    //this.routeSegments = routeSegments;
                                    
                                    const athleteSegmentData = {
                                        segmentData: {
                                            currentPosition: xCoord,
                                            routeSegments: routeSegments,
                                            foundRoute: this.foundRouteRoadseg,
                                            nextSegment: {
                                                name: nextSegmentName,
                                                displayName: nextSegmentDisplayName,
                                                distanceToGo: nextSegmentDistanceToGo,
                                                distanceToGoUnits: distanceToGoUnits,
                                                id: nextSegment.id,
                                                repeat: nextSegment.repeat,
                                                xCoord
                                            }
                                        }
                                    }
                                    //debugger
                                    //console.log("updating athlete, refresh rate: " + this.refresh)
                                    common.rpc.updateAthleteData(this.watchingId, athleteSegmentData)
                                }  
                                
                                
                                let deltaAvg = this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length                        
                                let distDelta = state.eventDistance - xCoord;
                                
                                //debugger
                                if (this.deltas.length <= 10 ||
                                    ((this.deltas.length >= 10 && distDelta < (deltaAvg * 2) && isBetween((Math.abs(deltaAvg) - Math.abs(distDelta)), -50, 50)) ||
                                    isNaN(deltaAvg))
                                    ) // make sure the computed distDelta isn't way different than average due to a misplaced pin
                                {
                                    if (state.eventDistance > 0 && xCoord > 0 && distDelta != 0) {
                                        this.deltas.push(distDelta);  
                                        this.deltaIgnoreCount = 0;                              
                                        if (this.deltas.length > 50)
                                        {            
                                            this.deltas.shift();                    
                                        }   
                                    } else {
                                        //console.log("eventdistance " + state.eventDistance + " xCoord " + xCoord + " distdelta " + distDelta )
                                    }
                                    //console.log("deltas is " + this.deltas.reduce((a, b) => a + b, 0) / this.deltas.length);
                                } else {
                                    //console.log("Ignoring distDelta " + distDelta + " that is more than double the avg " + deltaAvg + " or distDelta deviates from the avg by > 50")
                                    //console.log("deltaAvg is: " + deltaAvg + " distDelta is: " + distDelta )
                                    this.deltaIgnoreCount++
                                    if (this.deltaIgnoreCount > 10) {
                                        //console.log("Something is wrong, resetting deltas")
                                        this.deltaIgnoreCount = 0;
                                        this.deltas.length = 0;
                                    }
                                    //debugger
                                }
                            }
                            if (this.showLineAhead && isWatching) { 
                                let lineCoord;
                                //debugger
                                if (!this.routeId) {
                                    lineCoord = watching.reverse ? xCoord - parseInt(this.distanceAhead) : xCoord + parseInt(this.distanceAhead)
                                } else {
                                    lineCoord = xCoord + parseInt(this.distanceAhead)
                                }
                                //let lineCoord = xCoord + parseInt(this.distanceAhead)
                                let currentMarkLines = this.chart.getOption().series[0].markLine ? this.chart.getOption().series[0].markLine : [];                                  
                                let currentAheadLine = currentMarkLines.data.find(x => x.name == "aheadLine");
                                if (currentAheadLine) {                                    
                                    currentAheadLine.xAxis = lineCoord;
                                    currentAheadLine.lineStyle.type = this.aheadLineType;
                                    currentAheadLine.lineStyle.color = this.aheadLineColor;
                                    currentAheadLine.lineStyle.width = this.lineSize;
                                    currentAheadLine.label.color = this.aheadLineColor;
                                    currentAheadLine.label.formatter = `+${this.distanceAhead}m`;
                                    //console.log("Found an existing ahead line")
                                } else {
                                    //console.log("no ahead line found")                                    
                                    let newAheadLine = {                                        
                                        xAxis: lineCoord,
                                        name: "aheadLine",
                                        lineStyle: {
                                            width: this.lineSize,
                                            type: this.aheadLineType,
                                            color: this.aheadLineColor
                                        },
                                        label: {
                                            show: true,
                                            position: 'end',
                                            formatter: `+${this.distanceAhead}m`,
                                            rotate: 0,
                                            color: this.aheadLineColor
                                        }
                                    }
                                    currentMarkLines.data.push(newAheadLine)                                    
                                }
                                this.chart.setOption({
                                    series: {
                                        name: 'Elevation',
                                        markLine: {
                                            data: currentMarkLines.data
                                        }
                                    }
                                })
                                
                            };
                            let symbol;
                            if (isBeacon) {                            
                                //beaconImage = "image://../pages/images/pp-" + beaconColour + ".png"                            
                                symbol = "path://m 19.000923,56.950256 h 1.021954 V 100 h -0.963276 z m -1.266211,-22.991813 7.026027,-6.131803 -3.321394,9.069959 z m 3.832378,2.107806 a 2.4271723,2.3632993 0 0 1 -2.427172,2.3633 2.4271723,2.3632993 0 0 1 -2.427171,-2.3633 2.4271723,2.3632993 0 0 1 2.427171,-2.363299 2.4271723,2.3632993 0 0 1 2.427172,2.363299 z M 19.521675,13.903697 1.1291999,24.759155 1.2559791,46.349633 19.521675,57.20826 37.917319,46.859918 38.174047,25.015882 Z m 0.129951,10.475121 A 11.369386,11.369386 0 0 1 31.020536,35.747733 11.369386,11.369386 0 0 1 19.651624,47.116646 11.369386,11.369386 0 0 1 8.2827093,35.747733 11.369386,11.369386 0 0 1 19.651626,24.378818 Z M 1,11.858402 19.523156,1 38.174058,11.789339 38.046313,19.267666 19.581839,9.5589751 1.0932144,19.081236 Z"
                            } else if (isGroup) {
                                symbol = "path://M 50,50 a 50,50 0 1,0 0,100 a 50,50 0 1,0 0,-100 M 50,150 L 50,250"
                            } else if (this.customPin && this.useCustomPin) {
                                //debugger
                                symbol = this.customPin;
                            } else if (this.pinName) {
                                symbol = zen.pins.find(x => x.name == this.pinName).path;
                            } else {
                                symbol = zen.pins.find(x => x.name == "Default").path;
                            }                        
                            let symbolSize = isGroup ? this.em(groupPinSize) : isWatching ? this.em(watchingPinSize) : ((isTeamMate && this.showTeamMembers) || (isMarked && this.showMarkedRiders) || (isBeacon)) ? this.em(teamPinSize) : deemphasize ? this.em(deemphasizePinSize) : this.em(otherPinSize)
                            
                            if (isGroup) {
                                if (isWatching) {                                  
                                  const myGroup = this.groups.find(x => x.watching)
                                  if (myGroup) {
                                        state.groupSpeed = myGroup.speed;
                                        state.groupPower = myGroup.power;
                                        state.groupWeight = myGroup.weight;
                                        state.groupGapEst = myGroup.isGapEst;
                                        state.groupSize = myGroup.athletes.length;
                                    } else {
                                        console.log("Missing myGroup data!")
                                        state.groupSpeed = 0;
                                        state.groupPower = 0;
                                        state.groupWeight = 1;
                                        state.groupGapEst = true;
                                        state.groupSize = 1;
                                    }
                                }
                                let maxGroupSize = 0;
                                for (let group of this.groups) {
                                    if (group.athletes.length > maxGroupSize) {
                                        maxGroupSize = group.athletes.length;
                                    }
                                }
                                if (state.groupSize > 1) {
                                    let proportion = (state.groupSize - 1) / (maxGroupSize - 1)
                                    if (isWatching && proportion < 1) {
                                        proportion = ((1 - proportion) / 2) + proportion // give a little more emphasis to watching group pin size
                                    }
                                    const result = 1.5 + proportion
                                    symbolSize = symbolSize * result;
                                } else {
                                    symbolSize = isWatching ? symbolSize * 1.5 : symbolSize; // if not in a group, make watching pin 1.5x larger for emphasis
                                }
                                const pinData = {
                                    name: state.athleteId,
                                    coord: [xCoord, yCoord],                            
                                    symbol: symbol,
                                    symbolKeepAspect: true,                            
                                    symbolSize: symbolSize,                                                        
                                    symbolOffset: [0, -(symbolSize / 2)],                            
                                    itemStyle: {
                                        color: isWatching ? watchingPinColor : '#fff7',
                                        borderWidth: this.em(isWatching ? 0.02 : 0.02),
                                        borderColor: '#000'
                                    },
                                    label: {
                                        show: true,
                                        formatter: state.groupSize > 1 ? state.groupSize.toString() : "",
                                        color: 'white',
                                        position: 'insideTop',
                                        fontSize: symbolSize / 4,
                                        offset: [0,4 * this.pinSize]
                                    },
                                    emphasis: {
                                        label: {
                                            fontSize: this.em(markPointLabelSize),
                                            fontWeight: 400,
                                            lineHeight: this.em(1.15 * markPointLabelSize),
                                            position: (state.altitude - this._yAxisMin) / deltaY > 0.4 ? 'bottom' : 'top',
                                            backgroundColor: '#222e',
                                            borderRadius: this.em(0.22 * markPointLabelSize),
                                            borderWidth: 1,
                                            borderColor: '#fff9',
                                            align: 'left',
                                            padding: [
                                                this.em(0.2 * markPointLabelSize),
                                                this.em(0.3 * markPointLabelSize)
                                            ],
                                            formatter: this.groupEmphasisLabel.bind(this),
                                        }
                                    },
                                
                                };
                                if (isWatching) {
                                    pinData.itemStyle.opacity = 1;
                                    watchingPinData.push(pinData);
                                    return;
                                } else {
                                    return pinData;                                
                                };
                                
                            } else {
                                let beaconLabel = {show: false};                                
                                if (this.showRobopacers && this.showRobopacersGap) {
                                    let beaconLabelData = "";
                                    let beaconLabelZen = "";
                                    if (beaconData?.data?.athlete) {
                                        const zenGap = Math.ceil(this.watchingPosition - xCoord);
                                        const sauceGap = Math.ceil(beaconData.data.gapDistance) || zenGap
                                        let beaconName = beaconData.data.athlete.fullname
                                        const ppGroupSize = beaconData.data.state.pacerBotGroupSize || null;
                                        beaconName = ppGroupSize ? `${beaconName} (${ppGroupSize})` : beaconName;
                                        //console.log("beaconData", beaconData)
                                        const gapDisplay = Math.abs(sauceGap) > 50 ? zenGap : sauceGap
                                        if (gapDisplay > 0) {
                                            //beaconLabelData = `${beaconName}\n${Math.abs(gapDisplay)}m\u21A4`
                                            beaconLabelData = `${beaconName}\n${H.distance(gapDisplay, {suffix: true})}\u21A4`
                                        } else if (gapDisplay < 0) {
                                            //beaconLabelData = `${beaconName}\n\u21A6${Math.abs(gapDisplay)}m`
                                            beaconLabelData = `${beaconName}\n\u21A6${H.distance(Math.abs(gapDisplay), {suffix: true})}`
                                        } else {
                                            beaconLabelData = `${beaconName}\n0m`
                                        } 
                                        /*
                                        if (beaconData?.data?.gapDistance) {
                                            const gap = Math.ceil(beaconData.data.gapDistance)
                                            if (gap > 0) {
                                                beaconLabelData = `${beaconData.data.athlete.fullname}\n${Math.abs(gap)}m\u21A4`
                                            } else if (gap < 0) {
                                                beaconLabelData = `${beaconData.data.athlete.fullname}\n\u21A6${Math.abs(gap)}m`
                                            } else {
                                                beaconLabelData = `${beaconData.data.athlete.fullname}`
                                            }                                        
                                        } else {
                                            beaconLabelData = `${beaconData?.data?.athlete?.fullname}`
                                        }
                                        if (zenGap > 0) {
                                            beaconLabelZen = `\n${Math.abs(zenGap)}m\u21A4 (z)`
                                        } else if (zenGap < 0) {
                                            beaconLabelZen = `\n\u21A6${Math.abs(zenGap)}m (z)`
                                        }
                                        beaconLabelData += beaconLabelZen;
                                        */
                                        if (isPP) {
                                            //console.log("beaconData", beaconData)
                                            beaconLabel = {
                                                show: true,
                                                position: "top",
                                                distance: this.em(2 * markPointLabelSize),
                                                fontSize: this.fontScale * 15,
                                                color: beaconColour,
                                                formatter: beaconLabelData
                                            }
                                        }
                                        if (isBeacon) {

                                        }
                                    }
                                }
                                return {
                                    name: state.athleteId,
                                    coord: [xCoord, yCoord],                            
                                    symbol: symbol,
                                    symbolKeepAspect: true,                            
                                    symbolSize: symbolSize,                                                        
                                    symbolOffset: [0, -(symbolSize / 2)],                            
                                    itemStyle: {
                                        color: isBeacon? beaconColour : isWatching ? watchingPinColor : (isTeamMate && this.showTeamMembers) ? watchingPinColor : (isMarked && this.showMarkedRiders) ? markedPinColor : deemphasize ? '#0002' : '#fff7',
                                        borderWidth: this.em(isWatching ? 0.04 : 0.02),
                                    },
                                    emphasis: {
                                        label: {
                                            fontSize: this.em(markPointLabelSize),
                                            fontWeight: 400,
                                            lineHeight: this.em(1.15 * markPointLabelSize),
                                            position: (state.altitude - this._yAxisMin) / deltaY > 0.4 ? 'bottom' : 'top',
                                            backgroundColor: '#222e',
                                            borderRadius: this.em(0.22 * markPointLabelSize),
                                            borderWidth: 1,
                                            borderColor: '#fff9',
                                            align: (xIdx > this._distances.length / 2) ^ this.reverse ? 'right' : 'left',
                                            padding: [
                                                this.em(0.2 * markPointLabelSize),
                                                this.em(0.3 * markPointLabelSize)
                                            ],
                                            formatter: this.onMarkEmphasisLabel.bind(this),
                                        }
                                    },
                                    label: beaconLabel
                                };
                            };
                    };
                    }).filter(x => x),
                },
            }]}); 
            
            this.chart.setOption({
                series: {
                    name: 'WatchingPin',
                    markPoint: {
                        data: watchingPinData
                    }
                }
            });
            if (!this.showGroups) {
                for (const [athleteId, mark] of this.marks.entries()) {
                    if (now - mark.lastSeen > 15000) {
                        this.marks.delete(athleteId);
                    }
                }
            } else {                
                for (const [athleteId, mark] of this.marks.entries()) {                    
                    if (mark.state.groupTS != this.groupTS) {
                        if (athleteId != this.watchingId) {
                            this.marks.delete(athleteId) // delete marks that aren't the watching pin and not the current timestamp                            
                        }
                    }
                }
            }
        } else {
            this.clear()
        }
    }    

    onMarkEmphasisLabel(params) {
        if (!params || !params.data || !params.data.name) {
            return;
        }
        const mark = this.marks.get(params.data.name);
        if (!mark) {
            return;
        }
        const ad = common.getAthleteDataCacheEntry(mark.athleteId);
        let team = "";
        if (ad && (ad.athlete && ad.athlete.team)) {
            team = "(" + ad.athlete.team + ")";
            //console.log("team is: " + team)
            //debugger
        }
        const name = ad?.athlete?.fLast || `ID: ${mark.athleteId}`;
        return `${name} ${team}, ${H.power(mark.state.power, {suffix: true})}`;
    }
    groupEmphasisLabel(params) {
        if (!params || !params.data || !params.data.name) {
            return;
        }
        const mark = this.marks.get(params.data.name);
        if (!mark) {
            return;
        }
        if (typeof(mark.state.groupSpeed) == "undefined") {
            return;
        }
        const size = `Riders: ${mark.state.groupSize}`;
        const speed = `${mark.state.groupSpeed.toFixed(1)} kph`;
        const wkg = (mark.state.groupPower / mark.state.groupWeight).toFixed(1)
        const power = `${mark.state.groupPower.toFixed(0)}w (${wkg} w/kg)`;
        //debugger
        let gapDistance;
        let gapTime;
        let gapMessage;
        if (typeof(mark.state.gapDistance) != "undefined" && mark.state.gapDistance < 0) {
            gapDistance = `${mark.state.gapDistance?.toFixed(0) * -1}`;
            gapTime = `${mark.state.gapTime?.toFixed(0) * -1}`;
            gapMessage = `${gapDistance}m / ${gapTime}s ahead`
        } else if (mark.state.gapDistance > 0){
            gapDistance = `${mark.state.gapDistance?.toFixed(0)}`;
            gapTime = `${mark.state.gapTime?.toFixed(0)}`;
            gapMessage = `${gapDistance}m / ${gapTime}s behind`
        }
        
        //TODO: Gap distance and time 
        if (gapDistance != null) {
            return `${size}\n${speed}\n${power}\n${gapMessage}`;
        } else {
            return `${size}\n${speed}\n${power}`;
        }
        
        //return `${name} ${team}, ${H.power(mark.state.power, {suffix: true})}`;
    }

    async _updateAthleteDetails(ids) {
        await common.getAthletesDataCached(ids);
    }
}

function isBetween(n, a, b) {
    return (n - a) * (n - b) <= 0
 }
 function getRelativeHue(grade, ranges) {
    // Find the range in which the grade falls
    const range = ranges.find(range => grade >= range.min && grade <= range.max);
    
    if (!range) {
        //debugger
        throw new Error('Grade is not within any defined range');
    }
    
    // Calculate the relative position within the range
    const relativePosition = (grade - range.min) / (range.max - range.min);
    
    // Interpolate the hMin and hMax values
    const interpolatedHue = range.hMin + relativePosition * (range.hMax - range.hMin);
    
    return interpolatedHue;
}
function interpolateColor(grade, ranges) {
    
    // Find the appropriate range
    let rangeIndex = 0;
    while (rangeIndex < ranges.length - 1 && grade >= ranges[rangeIndex + 1].min) {
        rangeIndex++;
    }

    // Perform linear interpolation
    const lowerRange = ranges[rangeIndex];
    const upperRange = ranges[rangeIndex + 1];

    const factor = (grade - lowerRange.min) / (upperRange.min - lowerRange.min);

    const r = Math.round(lowerRange.r + (upperRange.r - lowerRange.r) * factor);
    const g = Math.round(lowerRange.g + (upperRange.g - lowerRange.g) * factor);
    const b = Math.round(lowerRange.b + (upperRange.b - lowerRange.b) * factor);

    // Convert RGB to HSL
    const hslColor = rgbToHsl(r, g, b);

    return hslColor;
}

// RGB to HSL conversion function
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max == min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }

    const hslString = `hsl(${Math.round(h * 360)}deg ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
    return hslString;
}
