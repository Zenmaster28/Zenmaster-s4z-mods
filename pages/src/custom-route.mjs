import * as common from '/pages/src/common.mjs';
import * as map from './map.mjs';
import * as elevation from './elevation-segments.mjs';
import * as data from '/shared/sauce/data.mjs';
import * as zen from './segments-xCoord.mjs';


const doc = document.documentElement;

common.settingsStore.setDefault({
    // v0.13.0...
    avoidRepackRush: true,
    profileOverlay: true,
    mapStyle: 'default',
    tiltShift: false,
    tiltShiftAmount: 80,
    sparkle: false,
    solidBackground: false,
    transparency: 0,
    backgroundColor: '#00ff00',
    fields: 1,
    autoHeading: true,
    quality: 50,
    verticalOffset: 0,
    fpsLimit: 30,
    // v0.13.1...
    zoomPriorityTilt: true,
    // v1.0.0
    profileHeight: 20,
    routeProfile: true,
    showElevationMaxLine: true,
    autoCenter: true,
    // v1.1+
    disableChat: false,
    showMap: true,
    showAllArches: true,
    showSegmentFinish: true,
    showSegmentStart: true,
    fontScale: 1,
    minSegmentLength: 100,
    showFunFacts: true
});

let settings = common.settingsStore.get();
const url = new URL(location);
const courseSelect = document.querySelector('#titlebar select[name="course"]');
const penSelect = document.querySelector('#titlebar select[name="startPen"]');
const distanceSelect = document.getElementById("customDistance");
const elevationSelect = document.getElementById("customElevation");
const infoPanel = document.getElementById('infoPanel');
const routeSetup = document.getElementById('routeSetup');
const routeSetupInfo = document.getElementById('routeSetupInfo');
const routeSetupContent = document.getElementById('routeSetupContent');
const routeSetupClose = document.getElementById('routeSetupClose');
const funFactsDiv = document.getElementById("funFacts");
if (routeSetupClose) {
    routeSetupClose.addEventListener('click', (e) => {
    if (e.target === routeSetupClose) {
        common.unsubscribe('athlete/self', updateRouteData);
        const routeSetupStatus = document.getElementById('routeSetupStatus');
        if (routeSetupStatus) {
            routeSetupStatus.innerHTML = "";
        }
        routeSetupContent.innerHTML = "";
        routeSetup.classList.add('hidden');
    }
    });
};
const clearButton = document.getElementById('clearButton');
if (clearButton) {
    clearButton.addEventListener("click", (e) => {
        if (e.target == clearButton) {
            common.rpc.updateAthleteData('self', {'zenCustomRoute': {}});
        }
    });
}
if (elevationSelect) {
    elevationSelect.value = null;
}
let customRouteSteps = [];
let startPen;
let routeData;

let worldList;
let routesList;
let zwiftMap;
let spawnPointArrow;
let elProfile;
let courseId = Number(url.searchParams.get('course')) || 6;
let courseSpawnPoints = [];
let startingSpawnPoint;
//let routeId = Number(url.searchParams.get('route')) || undefined;
let penList;
let intersections;
let badIntersections = [1190003]
let avoidRepackRush = settings.avoidRepackRush !== false;
//let showDebugStats = settings.showDebugStats !== false;

function qualityScale(raw) {
    raw = raw || 1;
    const min = 0.2;
    return Math.min(2, (raw / 100) * (1 - min) + min);
}


function getSetting(key, def) {
    const v = settings[key];
    return v === undefined ? def : v;
}


function createZwiftMap() {
    const opacity = 1 - 1 / (100 / (settings.transparency || 0));
    //const autoCenter = getSetting('autoCenter', true);
    const autoCenter = false;
    const zm = new map.SauceZwiftMap({
        el: document.querySelector('.map'),
        worldList,
        zoom: settings.zoom,
        autoHeading: autoCenter && getSetting('autoHeading', true),
        autoCenter,
        style: settings.mapStyle,
        opacity,
        tiltShift: settings.tiltShift && ((settings.tiltShiftAmount || 0) / 100),
        sparkle: settings.sparkle,
        quality: qualityScale(settings.quality || 80),
        verticalOffset: settings.verticalOffset / 100,
        fpsLimit: settings.fpsLimit || 30,
        zoomPriorityTilt: getSetting('zoomPriorityTilt', true),
        preferRoute: settings.routeProfile !== false,
        zoomCenter: settings.zoomCenter || false,
        overrideDistance: settings.overrideDistance || 0,
        overrideLaps: settings.overrideLaps || 0
    });
    const autoCenterBtn = document.querySelector('.map-controls .button.toggle-auto-center');
    const autoHeadingBtn = document.querySelector('.map-controls .button.toggle-auto-heading');

    function autoCenterHandler(en) {
        if (en) {
            zm.setDragOffset([0, 0]);
        }
        zm.setAutoCenter(en);
        zm.setAutoHeading(!en ? false : !!settings.autoHeading);
        autoCenterBtn.classList.toggle('primary', !!en);
        autoCenterBtn.classList.remove('outline');
        autoHeadingBtn.classList.toggle('disabled', !en);
        settings.autoCenter = en;
        common.settingsStore.set(null, settings);
    }

    function autoHeadingHandler(en) {
        zm.setAutoHeading(en);
        if (en) {
            zm.setHeadingOffset(0);
        }
        autoHeadingBtn.classList.remove('outline');
        autoHeadingBtn.classList.toggle('primary', !!en);
        settings.autoHeading = en;
        common.settingsStore.set(null, settings);
    }
    /*
    autoCenterBtn.classList.toggle('primary', settings.autoCenter !== false);
    autoCenterBtn.addEventListener('click', () =>
        autoCenterHandler(!autoCenterBtn.classList.contains('primary')));
    autoHeadingBtn.classList.toggle('disabled', settings.autoCenter === false);
    autoHeadingBtn.classList.toggle('primary', settings.autoHeading !== false);
    autoHeadingBtn.addEventListener('click', () =>
        autoHeadingHandler(!autoHeadingBtn.classList.contains('primary')));
    */
    zm.addEventListener('drag', ev => {
        if (ev.drag) {
            const dragging = !!(ev.drag && (ev.drag[0] || ev.drag[1]));
            if (dragging && settings.autoCenter !== false) {
                //autoCenterBtn.classList.remove('primary');
                //autoCenterBtn.classList.add('outline');
            }
        } else if (ev.heading) {
            //if (autoHeadingBtn.classList.contains('primary')) {
            //    autoHeadingBtn.classList.remove('primary');
            //    autoHeadingBtn.classList.add('outline');
            //}
        }
    });

    return zm;
}

function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}

function createElevationProfile() {
    const el = document.querySelector('.elevation-profile');
    if (settings.profileHeight) {
        el.style.setProperty('--profile-height', settings.profileHeight / 100);
    }
    const preferRoute = settings.routeProfile !== false;
    const showMaxLine = settings.showElevationMaxLine !== false;
    const showLapMarker = settings.showLapMarker !== false;
    const showSegmentStart = settings.showSegmentStart !== false;   
    const showLoopSegments = settings.showLoopSegments !== false; 
    const pinSize = settings.pinSize ? settings.pinSize : 1;
    const lineType = settings.lineType ? settings.lineType : "solid";
    const lineTypeFinish = settings.lineTypeFinish ? settings.lineTypeFinish : "[5, 10]";
    const lineSize = settings.lineSize ? settings.lineSize : 1.0;
    const pinColor = settings.pinColor ? settings.pinColor : "#ff430e";
    const showSegmentFinish = settings.showSegmentFinish !== false;    
    typeof(settings.showAllArches) == "undefined" ? common.settingsStore.set("showAllArches", false) : null;
    const showAllArches = settings.showAllArches;
    const minSegmentLength = settings.minSegmentLength ? settings.minSegmentLength : 500;
    const showNextSegment = settings.showNextSegment !== false;    
    const setAthleteSegmentData = settings.setAthleteSegmentData !== false;
    typeof(settings.showCompletedLaps) == "undefined" ? common.settingsStore.set("showCompletedLaps", true) : null;
    const showCompletedLaps = settings.showCompletedLaps;  
    typeof(settings.overrideDistance) == "undefined" ? common.settingsStore.set("overrideDistance", 0) : null 
    const overrideDistance = settings.overrideDistance;
    typeof(settings.overrideLaps) == "undefined" ? common.settingsStore.set("overrideLaps", 0) : null;
    const overrideLaps = settings.overrideLaps;    
    typeof(settings.yAxisMin) == "undefined" ? common.settingsStore.set("yAxisMin", 200) : null;
    const yAxisMin = settings.yAxisMin;
    typeof(settings.singleLapView) == "undefined" ? common.settingsStore.set("singleLapView", false) : null;
    const singleLapView = settings.singleLapView !== false;
    typeof(settings.profileZoom) == "undefined" ? common.settingsStore.set("profileZoom", false) : null;
    const profileZoom = settings.profileZoom;
    typeof(settings.zoomNextSegment) == "undefined" ? common.settingsStore.set("zoomNextSegment", false) : null;
    const zoomNextSegment = settings.zoomNextSegment;
    typeof(settings.zoomNextSegmentApproach) == "undefined" ? common.settingsStore.set("zoomNextSegmentApproach", 100) : null;
    const zoomNextSegmentApproach = settings.zoomNextSegmentApproach;
    typeof(settings.zoomFinalKm) == "undefined" ? common.settingsStore.set("zoomFinalKm", false) : null;
    const zoomFinalKm = settings.zoomFinalKm;
    typeof(settings.zoomSlider) == "undefined" ? common.settingsStore.set("zoomSlider", false) : null;
    const zoomSlider = settings.zoomSlider;
    typeof(settings.forwardDistance) == "undefined" ? common.settingsStore.set("forwardDistance", 5000) : null;
    const forwardDistance = settings.forwardDistance;
    typeof(settings.showMyPin) == "undefined" ? common.settingsStore.set("showMyPin", true) : null;
    const showMyPin = settings.showMyPin;
    typeof(settings.showTeamMembers) == "undefined" ? common.settingsStore.set("showTeamMembers", false) : null;
    const showTeamMembers =  settings.showTeamMembers;
    typeof(settings.showMarkedRiders) == "undefined" ? common.settingsStore.set("showMarkedRiders", false) : null;
    const showMarkedRiders = settings.showMarkedRiders;
    typeof(settings.showAllRiders) == "undefined" ? common.settingsStore.set("showAllRiders", true) : null;
    const showAllRiders = settings.showAllRiders;
    typeof(settings.showRobopacers) == "undefined" ? common.settingsStore.set("showRobopacers", false) : null;
    const showRobopacers = settings.showRobopacers;
    typeof(settings.showLeaderSweep) == "undefined" ? common.settingsStore.set("showLeaderSweep", false) : null;
    const showLeaderSweep = settings.showLeaderSweep;
    typeof(settings.pinColorMarked) == "undefined" ? common.settingsStore.set("pinColorMarked", "#9cb7ec") : null;
    const pinColorMarked = settings.pinColorMarked;typeof(settings.colorScheme) == "undefined" ? common.settingsStore.set("colorScheme", "sauce") : null
    const colorScheme = settings.colorScheme;typeof(settings.lineTextColor) == "undefined" ? common.settingsStore.set("lineTextColor", "#ffffff") : null;
    const lineTextColor = settings.lineTextColor;
    typeof(settings.gradientOpacity) == "undefined" ? common.settingsStore.set("gradientOpacity", 0.7) : null;
    const gradientOpacity = settings.gradientOpacity;
    typeof(settings.pinName) == "undefined" ? common.settingsStore.set("pinName", "Default") : null;
    const pinName = settings.pinName;
    typeof(settings.useCustomPin) == "undefined" ? common.settingsStore.set("useCustomPin", false) : null;
    const useCustomPin = settings.useCustomPin;
    typeof(settings.customPin) == "undefined" ? common.settingsStore.set("customPin", "") : null;
    const customPin = settings.customPin;
    typeof(settings.showGroups) == "undefined" ? common.settingsStore.set("showGroups", false) : null;
    const showGroups = settings.showGroups;
    typeof(settings.showLineAhead) == "undefined" ? common.settingsStore.set("showLineAhead", false) : null;
    const showLineAhead = settings.showLineAhead;
    typeof(settings.distanceAhead) == "undefined" ? common.settingsStore.set("distanceAhead", 1000) : null;
    const distanceAhead = settings.distanceAhead;
    typeof(settings.aheadLineColor) == "undefined" ? common.settingsStore.set("aheadLineColor", "#ff8000") : null;
    const aheadLineColor = settings.aheadLineColor;
    typeof(settings.aheadLineType) == "undefined" ? common.settingsStore.set("aheadLineType", 'solid') : null;
    const aheadLineType = settings.aheadLineType;
    typeof(settings.showNextPowerup) == "undefined" ? common.settingsStore.set("showNextPowerup", false) : null;
    const showNextPowerup = settings.showNextPowerup;
    typeof(settings.disablePenRouting) == "undefined" ? common.settingsStore.set("disablePenRouting", false) : null;
    const disablePenRouting = settings.disablePenRouting;
    typeof(settings.zoomRemainingRoute) == "undefined" ? common.settingsStore.set("zoomRemainingRoute", false) : null;
    const zoomRemainingRoute = settings.zoomRemainingRoute;
    typeof(settings.dataTransparency) == "undefined" ? common.settingsStore.set("dataTransparency", 0.8) : null;
    typeof(settings.showCurrentAltitude) == "undefined" ? common.settingsStore.set("showCurrentAltitude", false) : null;
    const showCurrentAltitude = settings.showCurrentAltitude;
    typeof(settings.showRouteMaxElevation) == "undefined" ? common.settingsStore.set("showRouteMaxElevation", false) : null;
    const showRouteMaxElevation = settings.showRouteMaxElevation;
    typeof(settings.showXaxis) == "undefined" ? common.settingsStore.set("showXaxis", false) : null;
    const showXaxis = settings.showXaxis;
    typeof(settings.xAxisIncrements) == "undefined" ? common.settingsStore.set("xAxisIncrements", 0) : null;
    const xAxisIncrements = settings.xAxisIncrements
    typeof(settings.xAxisInverse) == "undefined" ? common.settingsStore.set("xAxisInverse", false) : null;
    const xAxisInverse = settings.xAxisInverse
    typeof(settings.showNextSegmentFinish) == "undefined" ? common.settingsStore.set("showNextSegmentFinish", false) : null;
    const showNextSegmentFinish = settings.showNextSegmentFinish
    typeof(settings.invertSegmentText) == "undefined" ? common.settingsStore.set("invertSegmentText", "false") : null;
    const invertSegmentText = settings.invertSegmentText;
    typeof(settings.invertSegmentBool) == "undefined" ? common.settingsStore.set("invertSegmentBool", false) : null;
    const invertSegmentBool = settings.invertSegmentBool;
    const behindDistance = 100;
    const showRobopacersGap = false;
    const zoomSegmentOnlyWithinApproach = false;
    return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showNextSegmentFinish, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, behindDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showRobopacersGap, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, pinName, useCustomPin, customPin, zoomSegmentOnlyWithinApproach, showAllArches, showGroups, showLineAhead, distanceAhead, aheadLineColor, aheadLineType, showNextPowerup, disablePenRouting, zoomRemainingRoute, showCurrentAltitude, showRouteMaxElevation, showXaxis, xAxisIncrements, xAxisInverse, invertSegmentBool});
    //return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, showLapMarker, showSegmentStart, showLoopSegments, pinSize, lineType, lineTypeFinish, lineSize, pinColor, showSegmentFinish, minSegmentLength, showNextSegment, showMyPin, setAthleteSegmentData, showCompletedLaps, overrideDistance, overrideLaps, yAxisMin, singleLapView, profileZoom, forwardDistance, showTeamMembers, showMarkedRiders, pinColorMarked, showAllRiders, colorScheme, lineTextColor, showRobopacers, showLeaderSweep, gradientOpacity, zoomNextSegment, zoomNextSegmentApproach, zoomFinalKm, zoomSlider, showAllArches});
    //return new elevation.SauceElevationProfile({el, worldList, preferRoute, showMaxLine, colorScheme, showSegmentStart});
}

function centerMap(positions, options) {
    const xMin = data.min(positions.map(x => x[0]));
    const yMin = data.min(positions.map(x => x[1]));
    const xMax = data.max(positions.map(x => x[0]));
    const yMax = data.max(positions.map(x => x[1]));
    zwiftMap.setDragOffset([0, 0]);
    zwiftMap.setBounds([xMin, yMax], [xMax, yMin], options);
}


const _routeHighlights = [];

async function applyRouteV3(undo=false) {
    /*
    if (routeId != null) {
        url.searchParams.set('route', routeId);
    } else {
        url.searchParams.delete('route');
    }
    */
    history.replaceState({}, '', url);
    while (_routeHighlights.length) {
        _routeHighlights.pop().elements.forEach(x => x.remove());
    }
       let startPoint;
       let endPoint;
       let routePath = [];
       let routeManifest = {
        manifest: []
       };
       let routeIntersections = {
        intersections: [],
        testIntersections: []
       }
       //console.log("customRouteSteps", customRouteSteps)
       for (let i = 0; i < customRouteSteps.length - 1; i++) {            
            let breakOut = false;
            if (!undo && customRouteSteps.at(-2).pathToHere) {
                //debugger
                routeIntersections.intersections = [...customRouteSteps.at(-2).pathToHere.intersections];
                routePath = customRouteSteps.at(-2).pathToHere
                routeManifest.manifest = [] // reset and reload the manifest
                for (let step of customRouteSteps.at(-2).pathToHere) {
                    //debugger
                    step.manifest.forEach(m => {
                        routeManifest.manifest.push(m)
                    })
                }
                startPoint = {
                    roadId: customRouteSteps.at(-2).roadId,
                    rp: customRouteSteps.at(-2).roadPercent,
                    reverse: !customRouteSteps.at(-2).forward
                };
                endPoint = {
                        roadId: customRouteSteps.at(-1).roadId,
                        rp: customRouteSteps.at(-1).roadPercent
                }
                breakOut = true;
                //debugger
                console.log("Using previously calculated route", routePath)
            } else {
                startPoint = {
                        roadId: customRouteSteps[i].roadId,
                        rp: customRouteSteps[i].roadPercent,
                        reverse: !customRouteSteps[i].forward
                };
                endPoint = {
                        roadId: customRouteSteps[i + 1].roadId,
                        rp: customRouteSteps[i + 1].roadPercent
                }
            }
            const allRoads = await common.getRoads(courseId)
            const allCyclingRoads = allRoads.filter(x => x.sports.includes("cycling"))
            const worldId = common.courseToWorldIds[courseId]
            intersections = await fetch(`data/worlds/${worldId}/roadIntersections.json`).then(response => response.json());
            const roadData = intersections.find(x => x.id == endPoint.roadId)
            if (!roadData.roadIsPaddock) {             
                let paths = await zen.findPathFromAtoBv5(startPoint, endPoint, intersections, allCyclingRoads, courseId, avoidRepackRush);
                let shortestPath = paths.bestPath;
                let stats = paths.stats;
                console.log("stats", stats)
                if (settings.showFunFacts) {
                    let funFactsContent = `Fun Facts:<br>`
                    funFactsContent += `Possible paths found: ${stats.allPaths}<br>
                                        Shortest: ${parseInt(stats.shortestDistance)}m<br>
                                        Elapsed time finding a path: ${stats.timeSpentFindingPaths}ms<br>
                                        Abandoned paths:<br>
                                        - Too long: ${stats.exceedMaxLength}<br>
                                        - Longer than shortest path so far: ${stats.pathsTooLong} <br>
                                        - Too many hops: ${stats.tooManyHops}<br>
                    `
                    funFactsDiv.innerHTML = funFactsContent;
                } else {
                    funFactsDiv.innerHTML = "";
                }
                //let shortestPath = await zen.findPathFromAtoBv5(startPoint, endPoint, intersections, allCyclingRoads, courseId, avoidRepackRush)
                //if (shortestPath.testIntersections) {
                //    routeIntersections.testIntersections = shortestPath.testIntersections;
                //}
                if (shortestPath.path.length > 0) {
                    console.log("shortestPath",shortestPath)
                    //debugger
                    routePath.push(shortestPath)
                    shortestPath.manifest.forEach(path => {
                        routeManifest.manifest.push(path)
                    })
                    shortestPath.path.forEach(int => {
                        //debugger
                        if (int.passedIntersections?.length > 0) {
                            //console.log("passedIntersections",int.passedIntersections)
                            
                            for (let p of int.passedIntersections) {
                                if (int.forward) {
                                    const usedIntersection = p.forward.find(opt => opt.option.road == int.roadId)
                                    if (usedIntersection) {
                                        //debugger
                                        const passedIntData = {
                                            m_markerId: p.m_markerId,
                                            m_roadId: p.m_roadId,
                                            m_roadTime1: p.m_roadTime1,
                                            m_roadTime2: p.m_roadTime2,
                                            option: usedIntersection.option
                                        }
                                        routeIntersections.intersections.push(passedIntData)
                                        //debugger
                                    }                                    
                                } else {
                                    const usedIntersection = p.reverse.find(opt => opt.option.road == int.roadId)
                                    if (usedIntersection) {
                                        //debugger
                                        const passedIntData = {
                                            m_markerId: p.m_markerId,
                                            m_roadId: p.m_roadId,
                                            m_roadTime1: p.m_roadTime1,
                                            m_roadTime2: p.m_roadTime2,
                                            option: usedIntersection.option
                                        }
                                        routeIntersections.intersections.push(passedIntData)
                                    }  
                                }
                            }
                        }
                        if (int.intersection) {               
                            const intData = {
                                m_markerId: int.intersection.m_markerId,
                                m_roadId: int.intersection.m_roadId,
                                m_roadTime1: int.intersection.m_roadTime1,
                                m_roadTime2: int.intersection.m_roadTime2,
                                option: int.option
                            }
                            routeIntersections.intersections.push(intData)
                            //debugger
                        }
                        
                    })
                    customRouteSteps[i + 1].forward = !routeManifest.manifest.at(-1).reverse
                } else {
                    console.log("No route found")
                    alert(`Unable to find a path to that point.  It could be too far away or an unreachable road.`)
                    customRouteSteps.pop();
                }
            } else {
                console.log("Paddock Road was clicked")
                customRouteSteps.pop();
            }
            if (customRouteSteps[i + 1]) {
                customRouteSteps[i + 1].pathToHere = [...routePath]
                customRouteSteps[i + 1].pathToHere.intersections = routeIntersections.intersections
            }
            //debugger
            if (breakOut) {
                break;
            }
        }
        if (routePath.length == 0) {
            console.log("Can't find a path")
        } else {
            routeData = await zen.buildRouteData(routeManifest, courseId);
            routeData.manifest = zen.mergeManifest(routeData.manifest); // merge any consecutive manifest entries on the same road
            let calcIntersections = await zen.getManifestIntersections(routeData.manifest, courseId);
            routeData.pathIntersections = routeIntersections.intersections; //determined while exploring
            routeData.intersections = calcIntersections; // calculated from the manifest
            
            const matchingRoutes = startingSpawnPoint.routes;
            matchingRoutes.sort((a,b) => a.distance - b.distance)
            if (matchingRoutes.length > 0) {
                /*
                let routeList = `When you are ready to begin, start a free ride on one of these routes and then once you are in the world, click the Publish Route button.<br><br>
                                ***It is important that you wait until Zwift is loaded and you are in the world.***<br><hr>`;
                
                for (let route of matchingRoutes) {
                    routeList += `${route.name}<br>`;
                }
                */
                //infoPanel.innerHTML = routeList;
                
            } else {
                infoPanel.innerHTML = "Unable to find a matching route..."
            }
            console.log("RouteData",routeData)
            console.log("customRouteSteps", customRouteSteps)
            const routeElevation = zen.calcElevationGain(routeData.elevations)
            distanceSelect.value = parseInt(routeData.distances.at(-1));
            elevationSelect.value = parseInt(routeElevation)
            elProfile.sectionRouteData = routeData;
            elProfile.routeId = 999999999;
            //await elProfile.setPath();
            
            await elProfile.setRoute(999999999);
            let path;
            path = routeData.curvePath;
            
            _routeHighlights.push(
                zwiftMap.addHighlightPath(path, `route-3-section`, {width: 0.5, color: 'red'}),
            );
            //centerMap(routeData.curvePath.flatten(1/3));
            
            //zwiftMap.setVerticalOffset(0);
            //zwiftMap.setDragOffset([0, 0]);
            //zwiftMap.setZoom(0.5);
        }
    //}
}

async function applyCourse() {
    if (courseId != null) {
        //debugger
        url.searchParams.set('course', courseId);
    } else {
        url.searchParams.delete('course');
    }
    history.replaceState({}, '', url);
    courseSelect.replaceChildren();
    
    for (const x of worldList) {        
        courseSelect.insertAdjacentHTML('beforeend', `
            <option ${x.courseId === courseId ? 'selected' : ''}
                    value="${x.courseId}">${common.stripHTML(x.name)}</option>`);        
    }    
    if (courseId != null) {
        
        await zwiftMap.setCourse(courseId);
        if (elProfile) {
            await elProfile.setCourse(courseId);
        }   
        customRouteSteps = []; 
        
        const allSpawnPoints = document.querySelectorAll('.spawnPoint')
        for (let spawnPoint of allSpawnPoints) {                    
            spawnPoint.remove();
        }
        courseSpawnPoints = await zen.getRouteSpawnAreas(courseId);
        console.log("courseSpawnPoints", courseSpawnPoints)
        for (let spawnPoint of courseSpawnPoints) {
            const spArrow = zwiftMap.addPoint([0, 0], 'spawnPoint', spawnPoint.name);
            const spRoad = await common.getRoad(courseId, spawnPoint.roadId);
            let subPath = spRoad.curvePath.subpathAtRoadPercents(Math.min(spawnPoint.start, spawnPoint.end), Math.max(spawnPoint.start,spawnPoint.end));
            const pos = subPath.nodes[parseInt(subPath.nodes.length / 2)]?.end;
            spArrow.toggleHidden(!pos);
            spArrow.setPosition(pos);
        }
        await new Promise(resolve => setTimeout(resolve, 50)); // dumb but it works...
        
        for (let spawnPoint of courseSpawnPoints) {
            
            const spRoad = await common.getRoad(courseId, spawnPoint.roadId);
            const p1 = spRoad.curvePath.pointAtRoadPercent(Math.min(spawnPoint.start, spawnPoint.end));
            const p2 = spRoad.curvePath.pointAtRoadPercent(Math.max(spawnPoint.start, spawnPoint.end));           
            
            const p1p2Angle = zen.calculateBearing(p1, p2);
            let angle;
            if (spawnPoint.reverse) {
                angle = p1p2Angle.reverse
            } else {
                angle = p1p2Angle.forward
            }
            if (!zwiftMap.rotateCoordinates) {
                angle = angle + 90;
                if (angle < 0) {
                    angle += 360;
                }
            }
            const newSp = document.getElementById(spawnPoint.name);
            newSp.style.transform += ` rotate(${angle}deg)`;
            newSp.addEventListener("click", e => {
                if (customRouteSteps.length > 0) {
                    return;
                }
                const spId = e.currentTarget.id;
                e.currentTarget.classList.add("startSpawnPoint");
                const spawnPoint = courseSpawnPoints.find(x => x.name == spId);
                console.log("clicked spawnPoint", spawnPoint)
                startingSpawnPoint = spawnPoint;
                customRouteSteps = [];
                customRouteSteps.push({
                    roadId: spawnPoint.roadId,
                    roadPercent: spawnPoint.start,
                    forward: spawnPoint.reverse ? false : true
                });
                const allSpawnPoints = document.querySelectorAll('.spawnPoint:not(.startSpawnPoint)')
                for (let spawnPoint of allSpawnPoints) {                    
                    spawnPoint.style.visibility = "hidden"
                }
                setupMap();
                infoPanel.innerHTML = `- Build your route by clicking on roads.<br>
                                        - When the pointer changes to crosshairs and the road is highlighted in green, you have a valid place to click.<br> 
                                        - clicking Undo will go back 1 step (there is no redo)<br>
                                        - clicking Reset will reset to the beginning
                                        `   
                infoPanel.innerHTML += `<hr>When your route is complete, click the Finish button.<br>
                                        <input type=button id="finishButton" value=Finish></button>
                                        `
                document.getElementById("finishButton").addEventListener("click", publishRoute);             
            })
        }
    }    
}
async function publishRoute() {  
    const spawnPointRoutes = startingSpawnPoint.routes; 
    console.log("spawnPointRoutes", spawnPointRoutes);
    routeSetupContent.innerHTML = `<h1>*** Do not close this window unless you want to cancel!! ***</h1>
                                - Start a freeride on one of the routes below.<br>
                                - Once Zwift is loaded and on one of the proper routes, this custom route will be applied to Sauce.<br>
                                - Game connection needs to be enabled and connected and you need to have a "Custom Route Chauffeur" window open.<br>
                                - This window will close automatically once the route has been applied. (Clicking the X will prevent it from applying)
                                <hr style="width: 100%;">
                                `
    let routeList = "";
    let i = 1;
    for (let route of spawnPointRoutes) {
        if (i > 5) {
            break;
        }
        routeList += `${route.name}<br>`;
        i++;
    }
    routeSetupContent.innerHTML += routeList;
    routeSetupContent.innerHTML += `<div id=routeSetupStatus></div>`
    routeSetup.classList.remove('hidden'); 
    common.subscribe('athlete/self', updateRouteData);
}
async function updateRouteData(self) {   

    const spawnPointRoutes = startingSpawnPoint.routes;
    const matchingRoute = spawnPointRoutes.find(x => x.id == self.state.routeId);
    const rp = (self.state.roadTime - 5000) / 1e6;
    const low = Math.min(routeData.manifest[0].start, routeData.manifest[0].end);
    const high = Math.max(routeData.manifest[0].start, routeData.manifest[0].end);
    const inManifestStart = (self.state.roadId == routeData.manifest[0].roadId && 
                            rp >= low &&
                            rp <= high
    );
    if (matchingRoute && inManifestStart) {
        //debugger
        const result = await common.rpc.updateAthleteData('self', {'zenCustomRoute': {'ts': Date.now(), 'courseId': courseId, 'manifest': routeData.manifest}});
        console.log("publish result", result);
        if (result) {
            common.unsubscribe('athlete/self', updateRouteData);
            const routeSetupStatus = document.getElementById('routeSetupStatus');
            if (routeSetupStatus) {
                routeSetupStatus.innerHTML = "";
            }
            routeSetupContent.innerHTML = "";
            routeSetup.classList.add("hidden");
        }
    } else {
        const routeSetupStatus = document.getElementById('routeSetupStatus');
        routeSetupStatus.innerHTML = "<hr>Currently loaded route is not correct or you have moved too far from the initial spawn point";
        console.log("Not on a proper route.  Should be one of ", spawnPointRoutes)
        //not on a route that matches the spawnPoint or outside of the first manifest entry
    }
}

async function setupMap() {
    
    const svgPath = document.querySelector('svg.paths');
    const svgPathG = svgPath.querySelector("g")
    const svgPathGClassList = svgPathG.classList
    const svgRotated = svgPathGClassList.contains("rotated-coordinates")
    const useElements = svgPath.querySelectorAll('use');
    const worldId = common.courseToWorldIds[courseId]
    intersections = await fetch(`data/worlds/${worldId}/roadIntersections.json`).then(response => response.json());
    const courseRoads = await common.getRoads(courseId);
    const cyclingRoads = courseRoads.filter(x => x.sports.includes("cycling"));
    
    useElements.forEach((useElement) => {
        const elementRoad = parseInt(useElement.dataset.id);
        const roadData = intersections.find(x => x.id == elementRoad);
        const roadDataSauce = cyclingRoads.find(x => x.id == elementRoad);
        if (roadData.roadIsPaddock || !roadDataSauce) {   
            return;
        }
        useElement.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (customRouteSteps.length == 0) {
                return;
            }
            const href = useElement.getAttribute('href') || useElement.getAttribute('xlink:href');
            const pathElement = svgPath.querySelector(href);
            if (pathElement) {                
                const svg = pathElement.closest('svg'); // Find the nearest parent SVG
                if (!svg) {
                    console.error("Path is not within an SVG element");
                    return null;
                }
                const cursorPosition = zen.getCursorCoordinates(svg, event)
                let pointToFind = [cursorPosition.x, cursorPosition.y, 10000]
                if (svgRotated) {
                    pointToFind = [cursorPosition.y * -1, cursorPosition.x, 10000]
                }
                
                let thisRoad = parseInt(pathElement.id.replace("road-path-",""))
                console.log("Clicked road",thisRoad)
                let roadData = await common.getRoad(courseId, thisRoad)
                
                const points = [];
                let steps = 1000
                const step = 1 / (steps - 1); // Calculate the step size
                for (let i = 0; i < steps; i++) {
                    points.push(i * step);
                }
                let minDistance = Infinity
                let nearestPoint;
                let rp;
                for (let t of points) {
                        const pointOnSecondCurve = roadData.curvePath.pointAtRoadPercent(t);  
                        pointToFind[2] = pointOnSecondCurve[2]  
                        const distance = zen.calculateDistance(pointToFind, pointOnSecondCurve);
                        if (distance < minDistance) {            
                            minDistance = distance;
                            nearestPoint = pointOnSecondCurve;
                            rp = t;
                        } 
                    }                
                
                customRouteSteps.push({
                    roadId: thisRoad,
                    roadPercent: rp
                })
                await applyRouteV3();
                
            }
        });
        useElement.classList.add('clickableRoad');
    });
    //await applyRoute();
        
}
async function resetMap() {
    const id = Number(courseSelect.value);
    
    courseId = id;
    //routeId = undefined;
    infoPanel.innerHTML = "";
    distanceSelect.value = "";    
    elevationSelect.value = ""    ;
    elProfile.overrideLaps = 1;
    zwiftMap.overrideLaps = 1;
    elProfile.overrideDistance = 0;
    zwiftMap.overrideDistance = 0;
    customRouteSteps = [];
    const svgPath = document.querySelector('svg.paths');
    const useElements = svgPath.querySelectorAll('use');
    useElements.forEach(el => {
        el.classList.remove('clickableRoad')
        const clone = el.cloneNode(true);
        el.replaceWith(clone);
    });
    while (_routeHighlights.length) {
        _routeHighlights.pop().elements.forEach(x => x.remove());
    }
    await applyCourse();
    //setupMap();
    await elProfile.clear()
    infoPanel.innerHTML = "To begin, choose a spawn point by clicking on one of the red arrows.<br><br>Note that some have arrows pointing in both directions, be sure to choose the one facing in the direction that you want to start."
}
export async function main() {
    common.initInteractionListeners();
    common.setBackground(settings);
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1); 
    const undoButton = document.getElementById("undoButton");
    //const publishButton = document.getElementById("publishButton");
    const resetButton = document.getElementById("resetButton")
    undoButton.addEventListener('click', async undo => {
        customRouteSteps.pop()
        customRouteSteps.at(-1).pathToHere?.pop();
        
        await applyRouteV3(true);
    });
    /*
    publishButton.addEventListener('click', async publish => {
        if (routeData.intersections?.length > 0) {
            //const result = await common.rpc.updateAthleteData('self', {'zenCustomRoute': {'intersections': routeData.intersections, 'manifest': routeData.manifest}})
            const result = await common.rpc.updateAthleteData('self', {'zenCustomRoute': {'ts': Date.now(), 'courseId': courseId, 'manifest': routeData.manifest}})
            console.log("publish result", result)
        }
    })
    */
    
    resetButton.addEventListener('click', async ev => {
        resetMap();
    });
    courseSelect.addEventListener('change', async ev => {
        resetMap();
    });
    
    
    [worldList, routesList] = await Promise.all([common.getWorldList(), common.getRouteList()]);
    routesList = Array.from(routesList).sort((a, b) => a.name < b.name ? -1 : 1);
    
    let newRoutes = await fetch("data/routes.json").then((response) => response.json()); 
    newRoutes.forEach(newRoute => {
        const exists = routesList.some(route => route.id === newRoute.id);
        if (!exists) {
            newRoute.courseId = common.worldToCourseIds[newRoute.worldId]
            console.log("Adding route: " + newRoute.name + " to " + common.worldToNames[newRoute.worldId])            
            routesList.push(newRoute);
        }
    });
    routesList.sort((a, b) => a.name < b.name ? -1 : 1);    
    zwiftMap = createZwiftMap();
    spawnPointArrow = zwiftMap.addPoint([0, 0], 'spawnPoint');
    spawnPointArrow.toggleHidden(true);
    window.zwiftMap = zwiftMap;  // DEBUG
    window.MapEntity = map.MapEntity;
    if (settings.profileOverlay) {
        const point = zwiftMap.addPoint([0, 0], 'circle');
        point.toggleHidden(true);
        elProfile = createElevationProfile();
        elProfile.chart.on('updateAxisPointer', ev => {
            const pos = elProfile.curvePath.nodes[ev.dataIndex]?.end;
            point.toggleHidden(!pos);
            if (pos) {
                point.setPosition(pos);
            }
        });
    };    
    if (courseId != null) {
        
        if (!settings.showMap) {            
            document.getElementById("mapDiv").style.visibility = "hidden"
        }
        doc.classList.add('explore');
        doc.querySelector('#titlebar').classList.add('always-visible');
        let zoomLevel = 0.3;
        let verticalOffset = 0;
        if (courseId == 13) {
            zoomLevel = 0.2;
            verticalOffset = 0.2;
        }
        if (courseId == 7) {
            zoomLevel = 0.2;
        }
        if (courseId == 8) {
            zoomLevel = 0.18
        }
        zwiftMap.setZoom(zoomLevel);
        zwiftMap.setTiltShift(0);
        zwiftMap.setVerticalOffset(verticalOffset);
        zwiftMap._mapTransition.setDuration(500);
        
        //distanceSelect.value = settings.overrideDistance || "";        
        distanceSelect.value = "";        
        await applyCourse();
        infoPanel.innerHTML = "To begin, choose a spawn point by clicking on one of the red arrows.<br><br>Note that some have arrows pointing in both directions, be sure to choose the one facing in the direction that you want to start."
        //setupMap();
        
    } else {
        console.log("No courseId, This shouldn't happen")
    }
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        settings = common.settingsStore.get()
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {
            setBackground();
        } else if (changed.has('profileHeight')) {
            if (elProfile) {
                elProfile.el.style.setProperty('--profile-height', changed.get('profileHeight') / 100);
                elProfile.chart.resize();
            }
        } else if (changed.has('avoidRepackRush')) {
            avoidRepackRush = changed.get('avoidRepackRush')
        } else if (changed.has('fontScale')) {
            changeFontScale();
        } else if (changed.has('showElevationMaxLine')) {
            elProfile.showElevationMaxLine = changed.get('showElevationMaxLine')
        }
        
    });
    
}


export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();
}
