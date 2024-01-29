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
let missingLeadinRoutes = await fetch("data/missingLeadinRoutes.json").then((response) => response.json()); 

export class SauceElevationProfile {
    constructor({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, refresh=1000}) {
        this.el = el;
        this.worldList = worldList;
        this.preferRoute = preferRoute;
        this.showMaxLine = showMaxLine;
        this.showLapMarker = showLapMarker;
        this.showCompletedLaps = showCompletedLaps;
        this.lapCounter = 0;
        this.showSegmentStart = showSegmentStart;  
        this.showSegmentFinish = showSegmentFinish;
        this.minSegmentLength = minSegmentLength;
        this.showLoopSegments = showLoopSegments;
        this.showNextSegment = showNextSegment;
        this.lineType = lineType;
        this.lineTypeFinish = lineTypeFinish;
        this.lineSize = lineSize;
        this.pinSize = pinSize;
        this.pinColor = pinColor;
        this.showOnlyMyPin = showOnlyMyPin;
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
        this.routeGrades = [];
        this.foundRoute = false;
        this.overrideDistance = overrideDistance;
        this.overrideLaps = overrideLaps;
        this.customDistance = 0;
        this.customFinishLine;
        this.yAxisMin = yAxisMin;
        this.refresh = refresh;
        this._lastRender = 0;
        this._refreshTimeout = null;        
        el.classList.add('sauce-elevation-profile-container');
        this.chart = ec.init(el, 'sauce', {renderer: 'svg'});
        this.chart.setOption({
            animation: false,
            tooltip: {
                trigger: 'axis',
                formatter: ([{value}]) => {
                    if (!value) {
                        return '';
                    }
                    const dist = (this.reverse && this._distances) ?
                        this._distances.at(-1) - value[0] : value[0];
                    return `Dist: ${H.distance(dist, {suffix: true})}<br/>` +
                        `<ms large>landscape</ms>${H.elevation(value[1], {suffix: true})} ` +
                        `<small>(${H.number(value[2] * 100, {suffix: '%'})})</small>`;
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
        this._resizeObserver = new ResizeObserver(() => this.onResize());
        this._resizeObserver.observe(this.el);
        this._resizeObserver.observe(document.documentElement);
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

    setRoad(id, reverse=false) {
        routeSegments.length = 0;
        allMarkLines.length = 0;
        this.lapCounter = 1;
        let nextSegmentDiv = document.getElementById('nextSegmentDiv');
        nextSegmentDiv.innerHTML = "";
        nextSegmentDiv.style.visibility = "hidden";
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
            this.reverse = reverse;
            this.curvePath = this.road.curvePath;
            this._roadSigs.add(`${id}-${!!reverse}`);
            this.setData(this.road.distances, this.road.elevations, this.road.grades, {reverse});
        } else {
            this.reverse = undefined;
            this.curvePath = undefined;
        }
    }

    setRoute = common.asyncSerialize(async function(id, {laps=1, eventSubgroupId, distance}={}) {         
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
        let segmentsOnRoute = await zen.processRoute(this.courseId, this.routeId, laps, distance, this.showLoopSegments)
        console.log(segmentsOnRoute)
        this.routeInfo = segmentsOnRoute;
        this.routeDistances = Array.from(segmentsOnRoute.routeFullData.distances);            
        this.routeElevations = Array.from(segmentsOnRoute.routeFullData.elevations);
        this.routeGrades = Array.from(segmentsOnRoute.routeFullData.grades);        
        if (this.showSegmentStart)
        {   
            for (let segment of segmentsOnRoute.segments) {
                routeSegments.push(segment)
            }
            for (let markline of segmentsOnRoute.markLines) {
                allMarkLines.push(markline)
                if (this.lineTypeFinish.includes("["))
                {
                    this.lineTypeFinish = JSON.parse("[" + this.lineTypeFinish + "]")[0];
                }                               
                if (markline.name.includes("Finish")) {
                    if (this.showSegmentFinish && markline.segLength > this.minSegmentLength) {
                        markLines.push({
                            xAxis: markline.markLine,
                            lineStyle: {
                                width: this.lineSize,
                                type: this.lineTypeFinish
                            }, 
                            label: {
                                show: true,                            
                                formatter: '|||'
                            }
                        }); 
                    }
                } else {
                    markLines.push({
                        xAxis: markline.markLine,
                        lineStyle: {width: this.lineSize, type: this.lineType},
                        label: {
                            distance: 7,
                            position: 'insideEndTop',                    
                            formatter: markline.name
                        }
                    });
                }
            }
            
        }
        this._eventSubgroupId = eventSubgroupId;
        this._roadSigs = new Set();
        this.curvePath = null;        
        this.route = await zen.getModifiedRoute(id);
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
                lineStyle: {width: this.lineSize, type: this.lineType},
                label: {
                    distance: 7,
                    position: 'insideMiddleBottom',
                    formatter: `LAP`
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
            this.curvePath.extend(this.route.curvePath.slice(lapStartIdx));
            for (let i = lapStartIdx; i < this.route.distances.length; i++) {
                distances.push(distances.at(-1) +
                    (this.route.distances[i] - (this.route.distances[i - 1] || 0)));
                elevations.push(this.route.elevations[i]);
                grades.push(this.route.grades[i]);
            }
            if (this.showLapMarker)
            {
                markLines.push({
                    xAxis: this._routeLeadinDistance + lapDistance * lap,
                    lineStyle: {width: this.lineSize, type: this.lineType},
                    label: {
                        distance: 7,
                        position: 'insideMiddleBottom',
                        formatter: `LAP ${lap + 1}`,
                    }
                });
            }
            
            if (distance && distances[distances.length - 1] >= distance + 200) {
                break;
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
                    lineStyle: {width: this.lineSize, type: this.lineTypeFinish},
                    label: {
                        distance: 7,
                        position: 'insideEndTop',
                        formatter: `Finish`
                    }
                });
                if (!isNaN(markLineIndex)) {   
                    //allMarkLines.push({name: "Finish", markLine: xDist, id: null})
                }
            }
            if (this.customDistance > 0) {
                
                allMarkLines = allMarkLines.filter(x => x.markLine < distances.at(-1))
            }
            
        allMarkLines.sort((a, b) => {
            return a.markLine - b.markLine;
        });
        
        //console.log(allMarkLines)
        //console.log(routeSegments)
        //console.log(distances)
        //console.log(routeDistances)
        //this.setData(distances, elevations, grades, {markLines, markAreas});
        this.setData(this.routeDistances, this.routeElevations, this.routeGrades, {markLines, markAreas});
        return this.route;
    });

    setData(distances, elevations, grades, options={}) {
        this._distances = distances;
        this._elevations = elevations;
        this._grades = grades;
        const distance = distances[distances.length - 1] - distances[0];
        this._yMax = Math.max(...elevations);
        this._yMin = Math.min(...elevations);
        // Echarts bug requires floor/ceil to avoid missing markLines
        this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
        //this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + 200));
        this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + this.yAxisMin));
        const markLineData = [];
        if (this.showMaxLine) {
            markLineData.push({
                type: 'max',
                label: {
                    formatter: x => H.elevation(x.value, {suffix: true}),
                    position: options.reverse ? 'insideStartTop' : 'insideEndTop',
                },
            });
        }
        if (options.markLines) {
            options.markLines.sort((a,b) => {
                return a.xAxis - b.xAxis;
            })
            console.log(options.markLines)

            markLineData.push(...options.markLines);
        }
        const markAreaData = [];
        
        this.chart.setOption({
            xAxis: {inverse: options.reverse},
            yAxis: {
                min: this._yAxisMin,
                max: this._yAxisMax,
            },
            series: [{
                areaStyle: {
                    color:  {
                        type: 'linear',
                        x: options.reverse ? 1 : 0,
                        y: 0,
                        x2: options.reverse ? 0 : 1,
                        y2: 0,
                        colorStops: distances.map((x, i) => {
                            const steepness = Math.abs(grades[i] / 0.12);
                            const color = Color.fromRGB(steepness, 0.4, 0.5 * steepness)
                                .lighten(-0.25)
                                .saturate(steepness - 0.33);
                            return {
                                offset: x / distance,
                                color: color.toString(),
                            };
                        }),
                    },
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
        const watching = states.find(x => x.athleteId === this.watchingId); 
               
        if (!watching && (this.courseId == null || (!this.road && !this.route))) {
            return;
        } else if (watching) {
            if (watching.courseId !== this.courseId) {
                await this.setCourse(watching.courseId);
            }
            if (this.preferRoute) {
                if ((!watching.routeId && !this.routeOverride && (Date.now() - this.routeOverrideTS > 5000)) || (!watching.routeId && (Date.now() - this.routeOverrideTS > 5000))) {
                    //console.log("No route on watching, looking for a PP in group")
                    this.routeOverrideTS = Date.now();
                    this.routeOverride = await this.getPpRoute();
                }
                
                if (watching.routeId || this.routeOverride) {
                    
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
                            } 
                            
                            // Note sg.routeId is sometimes out of sync with state.routeId; avoid thrash
                            console.log(sg) 
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
            if (!this.routeId) {
                if (!this.road || this.road.id !== watching.roadId || this.reverse !== watching.reverse) {
                    this.setRoad(watching.roadId, watching.reverse);
                }
            }
        }
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
            return this._roadSigs.has(sig);
        });
        const markPointLabelSize = 0.4;
        const deltaY = this._yAxisMax - this._yAxisMin;
        const nodes = this.curvePath.nodes; 
                
        this.chart.setOption({series: [{
            markPoint: {
                itemStyle: {borderColor: '#222b'},
                animation: false,
                data: marks.map(({state}) => {                                        
                    let roadSeg;
                    let nodeRoadOfft;
                    let deemphasize;
                    const isWatching = state.athleteId === this.watchingId;
                    if (isWatching || !this.showOnlyMyPin) {                                       
                        if (this.routeId != null) {
                            //console.log("route not null")
                            if (state.routeId === this.routeId) {
                                let distance;
                                if (this._eventSubgroupId != null) {
                                    deemphasize = state.eventSubgroupId !== this._eventSubgroupId;
                                    distance = state.eventDistance;
                                } else {
                                    // Outside of events state.progress represents the progress of single lap.
                                    // However, if the lap counter is > 0 then the progress % does not include
                                    // leadin.
                                    const floor = state.laps ? this._routeLeadinDistance : 0;
                                    const totDist = this._distances[this._distances.length - 1];
                                    distance = state.progress * (totDist - floor) + floor;
                                }
                                const nearIdx = common.binarySearchClosest(this._distances, distance);
                                const nearRoadSegIdx = nodes[nearIdx].index;
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
                                debugger
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
                        let allOtherPins = this.showOnlyMyPin;
                        this.showOnlyMyPin ? allOtherPins = 1 : allOtherPins = 1;
                        let watchingPinSize = 1.1 * this.pinSize;
                        let deemphasizePinSize = 0.35 * this.pinSize * allOtherPins;
                        let otherPinSize = 0.55 * this.pinSize * allOtherPins;
                        let watchingPinColor = this.pinColor
                        //console.log(allOtherPins)
                        
                        if (isWatching)
                        {                        
                            //let nextSegment = this.getNextSegment(allMarkLines, xCoord)
                            //console.log(xCoord)
                            let nextSegment = zen.getNextSegment(allMarkLines, xCoord)
                            let distanceToGo;
                            let distanceToGoUnits;
                            if (this.showNextSegment && this.showSegmentStart)
                            {
                                let nextSegmentDiv = document.getElementById('nextSegmentDiv');
                                
                                if (nextSegment != -1)
                                {
                                    nextSegment.markLine - xCoord > 1000 ? distanceToGo = ((nextSegment.markLine - xCoord) / 1000).toFixed(2) : distanceToGo = (nextSegment.markLine - xCoord).toFixed(0);
                                    nextSegment.markLine - xCoord > 1000 ? distanceToGoUnits = "km" : distanceToGoUnits = "m";
                                    nextSegment.markLine - xCoord > 1000 ? this.refresh = 1000 : this.refresh = 200;
                                    nextSegmentDiv.innerHTML = nextSegment.name + ": " + distanceToGo + distanceToGoUnits;
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
                            if (this.setAthleteSegmentData)
                            {
                                
                                nextSegment.markLine - xCoord > 1000 ? distanceToGo = parseFloat((nextSegment.markLine - xCoord) / 1000).toFixed(2) : distanceToGo = parseFloat(nextSegment.markLine - xCoord).toFixed(0);
                                nextSegment.markLine - xCoord > 1000 ? distanceToGoUnits = "km" : distanceToGoUnits = "m";
                                nextSegment.markLine - xCoord > 1000 ? this.refresh = 1000 : this.refresh = 200;
                                nextSegment == -1 ? this.refresh = 1000 : "";
                                const routeSegments = allMarkLines;
                                let nextSegmentName;
                                let nextSegmentDistanceToGo;                            
                                if (nextSegment.name) {
                                    nextSegmentName = nextSegment.name;
                                    nextSegmentDistanceToGo = distanceToGo;
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
                                const athleteSegmentData = {
                                    segmentData: {
                                        currentPosition: xCoord,
                                        routeSegments: routeSegments,
                                        nextSegment: {
                                            name: nextSegmentName,
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
                        //debugger
                        //console.log({
                        return {
                            name: state.athleteId,
                            coord: [xCoord, yCoord],
                            symbolSize: isWatching ? this.em(watchingPinSize) : deemphasize ? this.em(deemphasizePinSize) : this.em(otherPinSize),
                            itemStyle: {
                                color: isWatching ? watchingPinColor : deemphasize ? '#0002' : '#fff7',
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
                        };
                }
                }).filter(x => x),
            },
        }]});
        for (const [athleteId, mark] of this.marks.entries()) {
            if (now - mark.lastSeen > 15000) {
                this.marks.delete(athleteId);
            }
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
        const name = ad?.athlete?.fLast || `ID: ${mark.athleteId}`;
        return `${name}, ${H.power(mark.state.power, {suffix: true})}`;
    }

    async _updateAthleteDetails(ids) {
        await common.getAthletesDataCached(ids);
    }
}

function isBetween(n, a, b) {
    return (n - a) * (n - b) <= 0
 }