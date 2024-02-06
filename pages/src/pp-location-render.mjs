import * as locale from '/shared/sauce/locale.mjs';
import * as common from '/pages/src/common.mjs';
import {Color} from '/pages/src/color.mjs';
import * as ec from '/pages/deps/src/echarts.mjs';
import * as theme from '/pages/src/echarts-sauce-theme.mjs';


locale.setImperial(!!common.storage.get('/imperialUnits'));
ec.registerTheme('sauce', theme.getTheme('dynamic'));
const H = locale.human;
let routeSegments = [];
let allMarkLines = [];

export class SauceElevationProfile {
    constructor({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin, setAthleteSegmentData, showCompletedLaps, refresh=1000}) {
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
        this.routeSegments = [];
        this.allMarkLines = [];
        this.showOnlyMyPin = showOnlyMyPin;
        this.setAthleteSegmentData = setAthleteSegmentData;
        const {fontScale} = common.settingsStore.get();        
        this.fontScale = fontScale;
        this.deltas = [];
        this.routeOffset = false;
        this.customDistance = 0;
        this.customFinishLine;
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
        this.routeSegments.length = 0;
        this.allMarkLines.length = 0;
        this.lapCounter = 1;
        let nextSegmentDiv = document.getElementById('routeNameDiv');
        nextSegmentDiv.innerHTML = "";
        nextSegmentDiv.style.visibility = "hidden";
        const athleteSegmentData = {
            segmentData: {
                currentPosition: 0,
                routeSegments: this.routeSegments,
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
        //distance = 13000;
        if (distance) {
            this.customDistance = distance
        } else {
            this.customDistance = 0;
        };        
        this.road = null;
        this.reverse = null;
        this.routeId = id;
        this.lastRouteId = id;
        this.lapCounter = 0;
        if (this.showSegmentStart)
        {
            await this.getSegmentsOnRoute(id);
        }
        this._eventSubgroupId = eventSubgroupId;
        this._roadSigs = new Set();
        this.curvePath = null;
        this.route = await common.getRoute(id);
        for (const {roadId, reverse} of this.route.manifest) {
            this._roadSigs.add(`${roadId}-${!!reverse}`);
        }
        this.curvePath = this.route.curvePath.slice();
        const distances = Array.from(this.route.distances);
        const elevations = Array.from(this.route.elevations);
        const grades = Array.from(this.route.grades);
        const markLines = [];
        const markAreas = [];
        const notLeadin = this.route.manifest.findIndex(x => !x.leadin);
        const lapStartIdx = notLeadin === -1 ? 0 : this.curvePath.nodes.findIndex(x => x.index === notLeadin);  
           
        if ((lapStartIdx || this.showCompletedLaps) && this.showLapMarker) {
        //if (this.showLapMarker) {
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
        if (this.showSegmentStart)
        {
            for (let segment of this.routeSegments)
            {                
                //let lineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;
                let percentOffset;
                let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;
                segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
                let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
                let markLineIndex = distances[boundsLineIndex] + indexOffset                
                this.allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})
                markLines.push({
                    xAxis: markLineIndex,
                    lineStyle: {width: this.lineSize, type: this.lineType},
                    label: {
                        distance: 7,
                        position: 'insideEndTop',                    
                        formatter: segment.name
                    }
                });
            }
        }
        
        for (let segment of this.routeSegments)
        {
        
            let percentOffset;
            let boundsLineIndex = segment.boundsFinish.curvePathIndex + segment.boundsFinish.originIndex;
            segment.reverse ? percentOffset = (1 - segment.boundsFinish.percent) : percentOffset = segment.boundsFinish.percent;
            let indexOffset;
            if (boundsLineIndex < this.route.distances.length - 1)
            {
                indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset
            }
            else
            {
                indexOffset = 0;
            }
            let markLineIndex = distances[boundsLineIndex] + indexOffset
            
            this.allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id}) 
            
            if (this.lineTypeFinish.includes("["))
            {
            this.lineTypeFinish = JSON.parse("[" + this.lineTypeFinish + "]")[0];
            }               
            
            if (this.showSegmentFinish && (segment.distance > this.minSegmentLength && !segment.name.toLowerCase().includes("loop")))
            {        
                markLines.push({
                    xAxis: markLineIndex,
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
            if (this.showSegmentStart)
            {
                for (let segment of this.routeSegments)
                {                    
                    if (segment.leadin)
                    {
                        continue;
                    }                                   
                    let percentOffset;
                    let boundsLineIndex = segment.bounds.curvePathIndex + segment.bounds.originIndex;
                    segment.reverse ? percentOffset = (1 - segment.bounds.percent) : percentOffset = segment.bounds.percent;
                    let indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset;
                    let markLineIndex = (lapDistance * lap) + distances[boundsLineIndex] + indexOffset;                    
                    this.allMarkLines.push({name: segment.name, markLine: markLineIndex, id: segment.id})                
                    markLines.push({
                        xAxis: markLineIndex,
                        lineStyle: {width: this.lineSize, type: this.lineType},
                        label: {
                            distance: 7,
                            position: 'insideEndTop',                    
                            formatter: segment.name
                        }
                    });
                }
            }  
            
                for (let segment of this.routeSegments)
                {                     
                    let percentOffset;
                    let boundsLineIndex = segment.boundsFinish.curvePathIndex + segment.boundsFinish.originIndex;
                    segment.reverse ? percentOffset = (1 - segment.boundsFinish.percent) : percentOffset = segment.boundsFinish.percent;
                    let indexOffset;
                    if (boundsLineIndex < this.route.distances.length - 1)
                    {
                        indexOffset = (distances[boundsLineIndex + 1] - distances[boundsLineIndex]) * percentOffset
                    }
                    else
                    {
                        indexOffset = 0;
                    }
                    let markLineIndex = (lapDistance * lap) + distances[boundsLineIndex] + indexOffset
                    //console.log("markLineIndex is: " + markLineIndex + " and indexOffset is: " + indexOffset + " for segment: " + segment.name)
                    this.allMarkLines.push({name: segment.name + " Finish", markLine: markLineIndex, id: segment.id}) 
                    //segment.boundsFinish.markLines.push(lapDistance * lap + distances[lineIndex]); 
                    //this.allMarkLines.push({name: segment.name + " Finish", markLine: lapDistance * lap + distances[lineIndex]})  
                    if (this.showSegmentFinish && (segment.distance > this.minSegmentLength && !segment.name.toLowerCase().includes("loop")))
                    {  
                        markLines.push({
                            xAxis: markLineIndex,
                            lineStyle: {width: this.lineSize, type: this.lineTypeFinish},
                            label: {
                                show: true,                            
                                formatter: '|||'
                            }
                        });
                    }
                
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
        //debugger
        if (this.routeOffset)
            {
                let offsetIdx = distances.findIndex(x => x > this.customDistance - this.routeOffset)
                //cdIdx = cdIdx + 2; // show a little more than the expected distance
                //console.log("offset index: " + offsetIdx + " offset distance: " + (this.customDistance - this.routeOffset))
                let xDist = (this.customDistance - this.routeOffset).toFixed(0);
                this.customFinishLine = xDist;
                //debugger
                markLines.push({
                    xAxis: xDist,
                    lineStyle: {width: this.lineSize, type: this.lineTypeFinish},
                    label: {
                        distance: 7,
                        position: 'insideEndTop',
                        formatter: `Finish`
                    }
                });
                this.allMarkLines.push({name: "Finish", markLine: xDist, id: null})
            }
            if (this.customDistance > 0) {
                
                this.allMarkLines = this.allMarkLines.filter(x => x.markLine < distances.at(-1))
            }
            //console.log(customMarklines)
        this.allMarkLines.sort((a, b) => {
            return a.markLine - b.markLine;
        });
        //debugger
        //console.log(this.allMarkLines)
        //debugger
        this.setData(distances, elevations, grades, {markLines, markAreas});
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
        this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + 200));
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
            //console.log(options.markLines)
            markLineData.push(...options.markLines);
        }
        const markAreaData = [];
        //debugger
        let ppDisplayInfo;        
        if (this.pacerBotGroupSize) {
            ppDisplayInfo = this.ppName + " (" + this.pacerBotGroupSize + ")" + " on " + this.route.name;
        } else {
            ppDisplayInfo = this.ppName + " on " + this.route.name;
        }
        this.chart.setOption({
            xAxis: {inverse: options.reverse},
            yAxis: {
                min: this._yAxisMin,
                max: this._yAxisMax,
            },
            title: {
                show: true,
                top: '10%',
                text: ppDisplayInfo,                
                textStyle: {                    
                    fontSize: this.em(0.3 * this.fontScale),
                },
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
        //debugger
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
            //debugger;
            if (
                this.compareProperties(currentNode.end, origin.end) &&            
                this.compareProperties(currentNode.cp1, origin.cp1) &&
                this.compareProperties(currentNode.cp2, origin.cp2)
            ) {
                console.log("Matched origin")
                //debugger;
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

    getNextSegment(arr, number) {
        // Sort the array based on the roadindex property
        if (arr.length == 0) {
            return -1;
        }
        arr.sort((a, b) => a.markLine - b.markLine);
    
        // Find the first object with a roadindex greater than the given number
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].markLine > number) {
                return arr[i];
            }
        }
        
        return -1;
    }
      

    async getSegmentsOnRoute() {        
        this.routeSegments.length = 0;
        this.allMarkLines.length = 0;
        let foundSegmentStart = false;
        let foundSegmentEnd = false;
        let includeSegment = false;
        let ignoreSegment = false;        
        let curvePathIndex = 0;
        let worldSegments = await common.rpc.getSegments(this.courseId)
        
        let routeFullData = await common.getRoute(this.routeId); 
        //console.log(routeFullData)               ;
        let zwiftSegmentsRequireStartEnd = await fetch("data/segRequireStartEnd.json").then((response) => response.json());        
        //let allRoutes = await common.rpc.getRoutes();
        for (let roadIndex in routeFullData.roadSegments)
        {
            let thisRoad = routeFullData.roadSegments[roadIndex];     
            
            if (typeof thisRoad.reverse === 'undefined')
            {
                thisRoad.reverse = false;            
            }        
            //console.log("Road segment: " + roadIndex + " roadId: " + thisRoad.roadId + " direction: " + thisRoad.reverse);       
            let segmentsOnRoad = worldSegments.filter(x => (x.roadId == thisRoad.roadId));
            if (segmentsOnRoad.length > 0)
            {
                for (let segment of segmentsOnRoad)
                {             
                    ignoreSegment = false;
                    if (segment.roadStart == null || segment.reverse != thisRoad.reverse) //ignore segments with no start and segment direction and road must match
                    {                        
                        ignoreSegment = true;
                    }   
                    if (!this.showLoopSegments && (
                                segment.roadStart == segment.roadFinish ||                        
                                segment.name.toLowerCase().includes("loop")
                            )
                        )
                    {
                        ignoreSegment = true;
                    }
                    includeSegment = false;
                    foundSegmentStart = thisRoad.includesRoadPercent(segment.roadStart);  
                    foundSegmentEnd = thisRoad.includesRoadPercent(segment.roadFinish);
                    //foundSegmentStart ? console.log("roadSegment " +  roadIndex + " goes through the start of " + segment.name) : "";
                    //foundSegmentEnd ? console.log("roadSegment " +  roadIndex + " goes through the end of " + segment.name) : "";
                    //debugger
                    if (zwiftSegmentsRequireStartEnd.includes(segment.id))
                    {
                        if (foundSegmentStart && foundSegmentEnd)
                        {
                            
                            includeSegment = true;                            
                        } 
                    }
                    else if (foundSegmentStart || foundSegmentEnd)
                    {
                        includeSegment = true;
                    }                    
                    if (includeSegment && !ignoreSegment)
                    {                        
                        let newSegment = {...segment}
                        newSegment.bounds = thisRoad.boundsAtRoadPercent(segment.roadStart);
                        newSegment.bounds.curvePathIndex = curvePathIndex;
                        newSegment.bounds.roadSegment = parseInt(roadIndex);
                        newSegment.boundsFinish = thisRoad.boundsAtRoadPercent(segment.roadFinish);
                        newSegment.boundsFinish.curvePathIndex = curvePathIndex;
                        newSegment.boundsFinish.roadSegment = parseInt(roadIndex);
                        newSegment.leadin = thisRoad.leadin ?? false;                        
                        let originIndex = this.findNodesIndex(thisRoad, newSegment.bounds.origin, newSegment.bounds.next, thisRoad.reverse, curvePathIndex); 
                        let originFinishIndex = this.findNodesIndex(thisRoad, newSegment.boundsFinish.origin, newSegment.boundsFinish.next, thisRoad.reverse, curvePathIndex); 
                        newSegment.bounds.originIndex = originIndex; 
                        newSegment.boundsFinish.originIndex = originFinishIndex;
                        //console.log("Segment: " + newSegment.name + " has originIndex of: " + originIndex)                   
                        //console.log("Segment: " + newSegment.name + " has originFinishIndex of: " + originFinishIndex)
                        newSegment.bounds.markLines = [];
                        newSegment.boundsFinish.markLines = [];                                               
                        //only include segment if it matches on the roadSegment data (not -1) and also avoid double matches by checking if the last roadsegment matched the same segment
                        // happens when roadsegments end and start at a banner on the leadin (like Fuego Flats)                        
                        if (originIndex != -1 && (
                                this.routeSegments.length == 0 || 
                                (newSegment.bounds.roadSegment - 1 != this.routeSegments[this.routeSegments.length - 1].bounds.roadSegment ||
                                    newSegment.name != this.routeSegments[this.routeSegments.length - 1].name
                                )
                            ))
                        {                            
                            this.routeSegments.push(newSegment);
                        }
                        else if (originIndex = -1 && foundSegmentEnd && (this.routeSegments.length == 0 || newSegment.bounds.roadSegment - 1 != this.routeSegments[this.routeSegments.length - 1].bounds.roadSegment)) // didn't match the start of the segment but found the end AND it's not on the list of segments requiring the start and end.  We must be in Scotland....
                        {
                            //debugger
                            this.routeSegments.push(newSegment);
                        }
                    }
                    else
                    {
                        //console.log("Not including segment: " + segment.name + " due to includeSegment: " + includeSegment + " and/or ignoreSegment: " + ignoreSegment)
                    }
                }
            }
            curvePathIndex += thisRoad.nodes.length;
        }
        //debugger
        //console.log(this.routeSegments)        
    }

    async renderAthleteStates(states, force) {
        //debugger
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
        //debugger
        const watching = states.find(x => x.athleteId === this.watchingId);             
        //const watching = states;
        if (!watching && (this.courseId == null || (!this.road && !this.route))) {
            return;
        } else if (watching) {
            //console.log("Setting group size to " + watching.pacerBotGroupSize)
            this.pacerBotGroupSize = watching.pacerBotGroupSize;
            if (watching.courseId !== this.courseId) {
                await this.setCourse(watching.courseId);
            }
            if (this.preferRoute) {
                if (watching.routeId) {
                    if (this.routeId !== watching.routeId ||
                        (this._eventSubgroupId || null) !== (watching.eventSubgroupId || null)) {
                        let sg;
                        if (watching.eventSubgroupId) {
                            sg = await common.rpc.getEventSubgroup(watching.eventSubgroupId);
                        } 
                        
                        // Note sg.routeId is sometimes out of sync with state.routeId; avoid thrash
                        //console.log(sg) 
                        this.deltas.length = 0;  // reset the delta averages 
                        this.routeOffset = 0;
                        this.lapCounter = 0;  
                        //debugger                    
                        if (sg && sg.routeId === watching.routeId && sg.distanceInMeters) {                            
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
                    /*
                    if (watching.laps != this.lapCounter && this.showLapMarker && watching.eventSubgroupId == 0 && this.showCompletedLaps) {                        
                        //if (this.routeId != null) {                            
                            let chartMarkLines = this.chart.getOption().series[0].markLine.data
                            if (chartMarkLines.length > 0) {
                                console.log("Updating lap marker");                                
                                let lapLabel = chartMarkLines.filter(x => x.label.formatter.indexOf("LAP") > -1)
                                //debugger
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
                    */
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
                    //console.log("Distance delta is: " + this.routeOffset)
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
            return this._roadSigs.has(sig);
        });
        const markPointLabelSize = 0.4;
        const deltaY = this._yAxisMax - this._yAxisMin;
        const nodes = this.curvePath.nodes;
        let ppDisplayInfo;
        //console.log(this.pacerBotGroupSize)
        if (this.pacerBotGroupSize) {
            ppDisplayInfo = this.ppName + " (" + this.pacerBotGroupSize + ")" + " on " + this.route.name;
        } else {
            ppDisplayInfo = this.ppName + " on " + this.route.name;
        }
        this.chart.setOption({
            title: {                
                text: ppDisplayInfo,                
            }
        })
        this.chart.setOption({series: [{
            markPoint: {
                itemStyle: {borderColor: '#222b'},
                animation: false,
                data: marks.map(({state}) => {
                    let roadSeg;
                    let nodeRoadOfft;
                    let deemphasize;
                    const isWatching = state.athleteId === this.watchingId;                    
                    if (this.routeId != null) {
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
                                return null;
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
                        return null;
                    }
                    const bounds = roadSeg.boundsAtRoadTime(state.roadTime);
                    const nodeOfft = roadSeg.reverse ?
                        roadSeg.nodes.length - 1 - (bounds.index + bounds.percent) :
                        bounds.index + bounds.percent;
                    const xIdx = nodeRoadOfft + nodeOfft;
                    if (xIdx < 0 || xIdx > this._distances.length - 1) {
                        //console.log(this._distances)
                        console.error("route index offset bad!", {xIdx});
                        return null;
                    }
                    let xCoord;
                    let yCoord;
                    if (xIdx % 1) {
                        const i = xIdx | 0;
                        const dDelta = this._distances[i + 1] - this._distances[i];
                        const eDelta = this._elevations[i + 1] - this._elevations[i];
                        xCoord = this._distances[i] + dDelta * (xIdx % 1);
                        yCoord = this._elevations[i] + eDelta * (xIdx % 1);
                    } else {
                        xCoord = this._distances[xIdx];
                        yCoord = this._elevations[xIdx];
                    }
                    if (isNaN(xCoord) || xCoord == null) {
                        console.error('xCoord is NaN');
                    }
                    /*if (isWatching) {
                        // XXX
                        console.log("got it", xCoord, xIdx, state.roadId, state.reverse, state.roadTime,
                                    {nodeRoadOfft, nodeOfft, reverse: state.reverse});
                    }*/
                    let allOtherPins = this.showOnlyMyPin;
                    this.showOnlyMyPin ? allOtherPins = 0 : allOtherPins = 1;
                    let watchingPinSize = 1.1 * this.pinSize;
                    let deemphasizePinSize = 0.35 * this.pinSize * allOtherPins;
                    let otherPinSize = 0.55 * this.pinSize * allOtherPins;
                    let watchingPinColor = this.pinColor
                    //console.log(allOtherPins)
                    /*
                    if (isWatching)
                    {
                        let nextSegment = this.getNextSegment(allMarkLines, xCoord)
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
                            //debugger
                            nextSegment.markLine - xCoord > 1000 ? distanceToGo = ((nextSegment.markLine - xCoord) / 1000).toFixed(2) : distanceToGo = (nextSegment.markLine - xCoord).toFixed(0);
                            nextSegment.markLine - xCoord > 1000 ? distanceToGoUnits = "km" : distanceToGoUnits = "m";
                            nextSegment.markLine - xCoord > 1000 ? this.refresh = 1000 : this.refresh = 200;
                            nextSegment == -1 ? this.refresh = 1000 : "";
                            const routeSegments = allMarkLines;
                            const athleteSegmentData = {
                                segmentData: {
                                    currentPosition: xCoord,
                                    routeSegments: routeSegments,
                                    nextSegment: {
                                        name: nextSegment.name,
                                        distanceToGo: distanceToGo,
                                        distanceToGoUnits: distanceToGoUnits,
                                        id: nextSegment.id,
                                        xCoord
                                    }
                                }
                            }
                            //debugger
                            //console.log("updating athlete, refresh rate: " + this.refresh)
                            common.rpc.updateAthleteData(this.watchingId, athleteSegmentData)
                        }  
                        let distDelta = state.eventDistance - xCoord;
                        this.deltas.push(distDelta);
                        if (this.deltas.length > 50)
                        {            
                            this.deltas.shift();                    
                        }                         
                    }
                    */
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
