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
    constructor({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showOnlyMyPin, setAthleteSegmentData, refresh=1000}) {
        this.el = el;
        this.preferSegment = true;
        this.segmentIdPreview = 9634088118;
        this.segmentReverse = false;
        this.worldList = worldList;
        this.preferRoute = false;
        this.showMaxLine = showMaxLine;
        this.showLapMarker = showLapMarker;
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

    setSegment(id, segmentRoad, reverse=false) {        
        reverse = id.reverse;
        this.roadId = id.roadId;
        this.roads = segmentRoad;
        this.route = null;
        this.routeId = null;
        this._eventSubgroupId = null;
        this._roadSigs = new Set();
        this._routeLeadinDistance = 0;        
        //this.road = this.roads ? this.roads.find(x => x.roadId === this.roadId) : undefined;
        this.road = this.roads;  
        let segmentStart;
        let segmentFinish;  
        let segmentDistances;
        let segmentElevations;
        let segmentGrades;
        if (reverse)
        {
            segmentStart = this.road.curvePath.boundsAtRoadPercent(id.roadFinish)
            segmentFinish = this.road.curvePath.boundsAtRoadPercent(id.roadStart)
            segmentDistances = this.road.distances.slice(segmentStart.index, segmentFinish.index + 2);
            segmentElevations = this.road.elevations.slice(segmentStart.index, segmentFinish.index + 2);
            segmentGrades = this.road.grades.slice(segmentStart.index, segmentFinish.index + 2);
        }
        else 
        {
            segmentStart = this.road.curvePath.boundsAtRoadPercent(id.roadStart);
            segmentFinish = this.road.curvePath.boundsAtRoadPercent(id.roadFinish);
            segmentDistances = this.road.distances.slice(segmentStart.index + 1, segmentFinish.index + 2);
            segmentElevations = this.road.elevations.slice(segmentStart.index + 1, segmentFinish.index + 2);
            segmentGrades = this.road.grades.slice(segmentStart.index + 1, segmentFinish.index + 2);
        }
        let startDistance = segmentDistances[0];
        for (let key in segmentDistances)
        {            
            segmentDistances[key] = segmentDistances[key] - startDistance;
        }
        //const segmentDistances = this.road.distances.slice(segmentStart.index + 1, segmentFinish.index + 2);
        //reverse ? segmentDistances.reverse() : "";
        //const segmentElevations = this.road.elevations.slice(segmentStart.index + 1, segmentFinish.index + 2);
        //reverse ? segmentElevations.reverse() : "";
        //const segmentGrades = this.road.grades.slice(segmentStart.index + 1, segmentFinish.index + 2);
        //debugger;
        //reverse ? segmentGrades.reverse() : "";
        //debugger
        if (this.road) {
            this.reverse = reverse;
            this.curvePath = this.road.curvePath;
            this._roadSigs.add(`${id}-${!!reverse}`);
            //this.setData(this.road.distances, this.road.elevations, this.road.grades, {reverse});
            //debugger
            this.setData(segmentDistances, segmentElevations, segmentGrades, {reverse});
        } else {
            this.reverse = undefined;
            this.curvePath = undefined;
        }
    }

    

    setData(distances, elevations, grades, options={}) {
        this._distances = distances;
        this._elevations = elevations;
        this._grades = grades;
        //console.log(grades)
        //debugger
        const distance = distances[distances.length - 1] - distances[0];
        this._yMax = Math.max(...elevations);
        this._yMin = Math.min(...elevations);
        // Echarts bug requires floor/ceil to avoid missing markLines
        //this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin - 20) : this._yMin) - 10;
        //this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin + 200));  
        this._yAxisMin = Math.floor(this._yMin > 0 ? Math.max(0, this._yMin) : this._yMin) - 5;
        this._yAxisMax = Math.ceil(Math.max(this._yMax, this._yMin)) + 5;  
        //debugger      
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
            markLineData.push(...options.markLines);
        }        
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
        routeSegments.length = 0;
        allMarkLines.length = 0;
        let foundSegmentStart = false;
        let foundSegmentEnd = false;
        let includeSegment = false;
        let ignoreSegment = false;        
        let curvePathIndex = 0;
        let worldSegments = await common.rpc.getSegments(this.courseId)
        
        let routeFullData = await common.getRoute(this.routeId); 
        console.log(routeFullData)               ;
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
                        if (newSegment.reverse)
                        {
                            newSegment.name.includes("reverse") ? "" : newSegment.name = newSegment.name + " Reverse"
                        }                        
                        //only include segment if it matches on the roadSegment data (not -1) and also avoid double matches by checking if the last roadsegment matched the same segment
                        // happens when roadsegments end and start at a banner on the leadin (like Fuego Flats)                        
                        if (originIndex != -1 && (
                                routeSegments.length == 0 || 
                                (newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment ||
                                    newSegment.name != routeSegments[routeSegments.length - 1].name
                                )
                            ))
                        {                            
                            routeSegments.push(newSegment);
                        }
                        else if (originIndex = -1 && foundSegmentEnd && (routeSegments.length == 0 || newSegment.bounds.roadSegment - 1 != routeSegments[routeSegments.length - 1].bounds.roadSegment)) // didn't match the start of the segment but found the end AND it's not on the list of segments requiring the start and end.  We must be in Scotland....
                        {
                            //debugger
                            routeSegments.push(newSegment);
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
        console.log(routeSegments)        
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
                if (watching.routeId) {
                    if (this.routeId !== watching.routeId ||
                        (this._eventSubgroupId || null) !== (watching.eventSubgroupId || null)) {
                        let sg;
                        if (watching.eventSubgroupId) {
                            sg = await common.rpc.getEventSubgroup(watching.eventSubgroupId);
                        }
                        // Note sg.routeId is sometimes out of sync with state.routeId; avoid thrash                        
                        if (sg && sg.routeId === watching.routeId) {
                            await this.setRoute(sg.routeId, {laps: sg.laps, eventSubgroupId: sg.id});
                        } else {
                            await this.setRoute(watching.routeId);
                        }
                    }
                } else {
                    this.route = null;
                    this.routeId = null;
                }
            }
            if (this.preferSegment) {
                //if (!this.road || this.road.id !== watching.roadId || this.reverse !== watching.reverse) {
                    //this.setRoad(watching.roadId, watching.reverse);
                    //debugger
                    this.setSegment(this.segmentIdPreview, this.segmentReverse)
                //}
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
        //debugger
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
                            const routeSegments = allMarkLines;
                            const athleteSegmentData = {
                                segmentData: {
                                    currentPosition: xCoord,
                                    routeSegments: routeSegments,
                                    nextSegment: {
                                        name: nextSegment.name,
                                        distanceToGo: distanceToGo,
                                        distanceToGoUnits: distanceToGoUnits,
                                        id: nextSegment.id
                                    }
                                }
                            }
                            common.rpc.updateAthleteData(this.watchingId, athleteSegmentData)
                        }                        
                    }
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
