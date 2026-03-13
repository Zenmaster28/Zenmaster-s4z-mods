import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
const doc = document.documentElement;
const content = document.getElementById("content")
let currentSegmentData;
let segmentTracker;
let courseId;
let segmentCourseId;
let worldMeta;
let segmentWorldMeta;
let courseRoads;
let segmentCourseRoads;
const worldList = await common.getWorldList()
let sauceStartPoint;
let segmentGoalTime;
let segmentDistance;

function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {        
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
};

function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
};

changeFontScale();

common.settingsStore.setDefault({
    fontScale: 1,
    onlyShowGap: false,
    startDistance: 500
});

let settings = common.settingsStore.get();
let onlyShowGap = settings.onlyShowGap ?? false;
let startDistance = settings.startDistance ?? 500;

async function decodeActivityFile(e) {
    const SC = 180 / Math.pow(2, 31);
    const file = e.target.files[0];

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const activityData = [];

        reader.onload = function(event) {
            try {
                const dv = new DataView(event.target.result);
                const headerSize = dv.getUint8(0);
                const dataSize = dv.getUint32(4, true);
                
                let offset = headerSize;
                const definitions = {};
                let count = 0;
                let startTime = null;

                while (offset < headerSize + dataSize) {
                    const headerByte = dv.getUint8(offset++);
                    const isDefinition = (headerByte & 0x40) === 0x40;
                    const localId = headerByte & 0x0F;

                    if (isDefinition) {
                        offset++;
                        const arch = dv.getUint8(offset++);
                        const isLE = (arch === 0);
                        const gmn = dv.getUint16(offset, isLE); 
                        offset += 2;
                        const numFields = dv.getUint8(offset++);
                        const fields = [];

                        for (let i = 0; i < numFields; i++) {
                            fields.push({
                                id: dv.getUint8(offset++),
                                size: dv.getUint8(offset++),
                                type: dv.getUint8(offset++)
                            });
                        }

                        if (headerByte & 0x20) {
                            const numDevFields = dv.getUint8(offset++);
                            offset += (numDevFields * 3);
                        }

                        definitions[localId] = {
                            gmn, fields, isLE,
                            totalSize: fields.reduce((s, f) => s + f.size, 0)
                        };

                    } else {
                        const def = definitions[localId];
                        if (!def) break;

                        if (def.gmn === 20) {
                            let fOffset = offset;
                            let lat = 0, lon = 0, distRaw = 0, altRaw = 0, timestamp = 0;

                            def.fields.forEach(f => {
                                if (f.id === 253) timestamp = dv.getUint32(fOffset, def.isLE);
                                if (f.id === 0) lat = dv.getInt32(fOffset, def.isLE) * SC;
                                if (f.id === 1) lon = dv.getInt32(fOffset, def.isLE) * SC;
                                if (f.id === 5) distRaw = dv.getUint32(fOffset, def.isLE);
                                if (f.id === 2) altRaw = dv.getUint16(fOffset, def.isLE);
                                
                                fOffset += f.size;
                            });

                            if (startTime === null) startTime = timestamp;                            
                            const altMeters = (altRaw / 5.0) - 500.0;
                            const distMeters = distRaw / 100.0;
                            const relativeSec = timestamp - startTime;

                            count++;
                            activityData.push({
                                idx: count,
                                lat: lat,
                                lon: lon,
                                distanceCm: distRaw,
                                distance: distMeters,
                                altitude: altMeters,
                                timeMs: relativeSec * 1000,
                                time: relativeSec
                            });
                        }
                        offset += def.totalSize;
                    }
                }
                resolve(activityData);
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
};

function bearing(lat1, lon1, lat2, lon2) {
    const toRadians = deg => (deg * Math.PI) / 180;
    const toDegrees = rad => (rad * 180) / Math.PI;

    const startLat = toRadians(lat1);
    const endLat = toRadians(lat2);
    const deltaLng = toRadians(lon2 - lon1);

    const y = Math.sin(deltaLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
              Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLng);

    const bearing = toDegrees(Math.atan2(y, x));
    
    return (bearing + 360) % 360;
};

function checkHeading(actual, target, tolerance = 70) {
    const diff = Math.abs(((actual - target + 540) % 360) - 180);
    return diff <= tolerance;
};

const formatTime = (milliseconds) => {
    //milliseconds = Math.round(milliseconds);
    //const ms = milliseconds.toString().padStart(3, "0").substr(-3).slice(0,timePrecision);    
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0) {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    };
    if (minutes != 0) {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0");
    } else {
        return seconds.toString().padStart(1, "0");
    };
};

class SegmentTracker {
    constructor(segmentPoints, startThreshold = 5, pointThreshold = 3, headingTolerance = 70) {
        this.segmentPoints = segmentPoints;
        this.startThreshold = startThreshold;
        this.pointThreshold = pointThreshold;
        this.headingTolerance = headingTolerance;
        this.started = false;
        this.finished = false;
        this.currentIdx = 0;
        this.startHeading = bearing(
            segmentPoints[0].lat, segmentPoints[0].lon,
            segmentPoints[1].lat, segmentPoints[1].lon
        );
        console.log("startHeading", this.startHeading)
        if (segmentWorldMeta.flippedHack) {
            console.log("adjustedHeading", 360 - this.startHeading)
            this.startHeading = 360 - this.startHeading;
        } else {
            console.log("adjustedHeading", 360 - (this.startHeading - 90))
            this.startHeading = 360 - (this.startHeading - 90);
        }
        this.startTime = null;
        this.totalDistance = segmentPoints.at(-1).distance;
    };

    update(lat, lon, watching) {
        if (this.finished) return;

        if (!this.started) {
            this.checkStart(lat, lon, watching);
            return;
        }

        const nextIdx = this.currentIdx + 1;
        const nextNextIdx = nextIdx + 1;
        if (nextIdx < this.segmentPoints.length) {
            const nextPoint = this.segmentPoints[nextIdx];
            const distance = haversineDistance(lat, lon, nextPoint.lat, nextPoint.lon);
            if (distance <= this.pointThreshold) {
                this.currentIdx = nextIdx;
            } else if (nextNextIdx < this.segmentPoints.length) {
                const nextNextPoint = this.segmentPoints[nextNextIdx];
                const nextNextDistance = haversineDistance(lat, lon, nextNextPoint.lat, nextNextPoint.lon);
                if (nextNextDistance < distance) {
                    // the point after the next target is closer, we probably missed a marker, advance ahead by one to catch up
                    console.warn("Possible missed point, advancing by 1")
                    this.currentIdx = nextIdx;
                    //return;
                };
            };            
        }

        // Check for segment end
        if (this.currentIdx === this.segmentPoints.length - 1) {
            this.finished = true;
        }
    }

    checkStart(lat, lon, watching) {
        let distance;
        if (!sauceStartPoint) {
            const startPoint = this.segmentPoints[0];
            distance = haversineDistance(lat, lon, startPoint.lat, startPoint.lon);
        } else {
            if (watching.state.roadId === sauceStartPoint.roadId && watching.state.reverse === sauceStartPoint.reverse) {
                const startRoad = segmentCourseRoads[sauceStartPoint.roadId];
                const rp = (watching.state.roadTime - 5000) / 1e6;
                let distToStart;
                if (watching.state.reverse) {
                    if (startRoad.looped && rp < sauceStartPoint.rp) {
                        distToStart = startRoad.curvePath.distanceBetweenRoadPercents(0, rp, 4e-2) + startRoad.curvePath.distanceBetweenRoadPercents(sauceStartPoint.rp, 1, 4e-2);
                    } else if (rp > sauceStartPoint.rp) {
                        distToStart = startRoad.curvePath.distanceBetweenRoadPercents(sauceStartPoint.rp, rp, 4e-2);
                    }
                } else {
                    if (startRoad.looped && rp > sauceStartPoint.rp) {
                        distToStart = startRoad.curvePath.distanceBetweenRoadPercents(rp, 1, 4e-2) + startRoad.curvePath.distanceBetweenRoadPercents(0, sauceStartPoint.rp, 4e-2);
                    } else if (rp < sauceStartPoint.rp) {
                        distToStart = startRoad.curvePath.distanceBetweenRoadPercents(rp, sauceStartPoint.rp, 4e-2);
                    };
                }
                if (distToStart) {
                    distance = distToStart / 100;
                }
            }
        }
        if (distance) {
            if ((distance) <= startDistance) {
                const est = sauceStartPoint ? "" : "(est)"
                let approachData = "";
                if (segmentDistance >= 1000) {
                    approachData += `Total distance: ${(segmentDistance / 1000).toFixed(2)}km<br>
                    Goal time: ${formatTime(segmentGoalTime)}<br>`
                } else {
                    approachData += `Total distance: ${parseInt(segmentDistance)}m<br>
                    Goal time: ${formatTime(segmentGoalTime)}`
                }
                if (distance >= 1000) {
                    approachData += `Distance to start: ${(distance / 1000).toFixed(2)}km ${est}`
                } else {
                    approachData += `Distance to start: ${parseInt(distance)}m ${est}`
                };
                content.innerHTML = approachData;
            } else {
                content.innerHTML = "";
            }
            //console.log("distance to start", distance)
            if (distance <= this.startThreshold) {
                // check heading
                //const actualHeading = bearing(lat, lon, this.segmentPoints[1].lat, this.segmentPoints[1].lon);
                const actualHeading = watching.state.heading;
                //debugger
                console.log(`actualHeading ${actualHeading} startHeading ${this.startHeading} headingTolerance ${this.headingTolerance}`)
                if (checkHeading(actualHeading, this.startHeading, this.headingTolerance)) {
                    this.started = true;
                    this.startTime = Date.now();
                    
                };
            };
        } else {
            content.innerHTML = "";
        }
  };

  getProgress(lat, lon) {
    if (!this.started) return null;

        const lastPoint = this.segmentPoints[this.currentIdx];
        const nextPoint = this.segmentPoints[Math.min(this.currentIdx + 1, this.segmentPoints.length - 1)];

        const totalSegmentDist = haversineDistance(lastPoint.lat, lastPoint.lon, nextPoint.lat, nextPoint.lon);
        const distanceToNext = haversineDistance(lat, lon, nextPoint.lat, nextPoint.lon);
        const distanceSoFar = this.segmentPoints[this.currentIdx].distance;
        const distanceRemaining = parseInt(this.totalDistance - distanceSoFar);
        const t = totalSegmentDist ? (1 - distanceToNext / totalSegmentDist) : 0;

        // interpolate segment time
        const lastTime = lastPoint.timeMs;
        const nextTime = nextPoint.timeMs;
        const interpolatedTime = lastTime + t * (nextTime - lastTime);        
        return {
            currentIdx: this.currentIdx,
            totalPoints: this.segmentPoints.length,
            //fraction: (this.currentIdx + t) / (this.segmentPoints.length - 1),
            segmentTimeMs: interpolatedTime,
            elapsedTimeMs: Date.now() - this.startTime,
            finished: this.finished,
            distanceRemaining: distanceRemaining
        };
    };
;}

async function updateProgress(watching) {
    if (watching.state.courseId != courseId) {
        courseId = watching.state.courseId;
        courseRoads = await common.rpc.getRoads(courseId);
        worldMeta = worldList.find(x => x.courseId === courseId);
    }
    if (!segmentTracker) {
        return;
    };
    
    const lat = watching.state.latlng[0];
    const lon = watching.state.latlng[1];
    segmentTracker.update(lat, lon, watching);
    const progress = segmentTracker.getProgress(lat, lon);
    if (progress) {
        if (progress.finished) {
            content.innerHTML = "Segment complete!"
        } else {
            const timeDiffMs = progress.elapsedTimeMs - progress.segmentTimeMs
            //console.log("timeDiffMs", timeDiffMs)
            const s = Math.abs(timeDiffMs) >= 60000 ? "" : "s";
            const timeDiff = formatTime((Math.abs(timeDiffMs)));
            let timeGap;
            if (timeDiffMs <= -1000) {
                timeGap = `<div class="ahead">Ahead: ${timeDiff}${s}</div>`;
            } else if (timeDiffMs >= 1000) {
                timeGap = `<div class="behind">Behind: ${timeDiff}${s}</div>`
            } else {
                timeGap = `<div class="level">On pace: ${timeDiff}</div>`
            }
            if (onlyShowGap) {
                content.innerHTML = timeGap;
            } else {
                const distRemaining = progress.distanceRemaining >= 1000 ? `${(progress.distanceRemaining / 1000).toFixed(2)}km` : `${progress.distanceRemaining}m`
                const totalDistance = segmentDistance >= 1000 ? `${(segmentDistance / 1000).toFixed(2)}km` : `${parseInt(segmentDistance)}m`
                const elapsedTime = formatTime(progress.elapsedTimeMs);
                const goalTime = formatTime(segmentGoalTime);
                content.innerHTML = `${timeGap}<br>Distance: ${distRemaining} / ${totalDistance}<br>Time: ${elapsedTime} / ${goalTime} `;
            }
        }
        //console.log(`Segment ${progress.currentIdx + 1}/${progress.totalPoints}, fraction: ${(progress.fraction*100).toFixed(1)}%, time: ${progress.segmentTimeMs}ms`);
    } else {
        //console.log("no progress")
    }
};

export async function help() {
    common.initInteractionListeners();
}
export async function main() {    
    common.initInteractionListeners();
    common.subscribe('athlete/watching', watching => {
        updateProgress(watching);
    });    

    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has('fontScale')) {
            changeFontScale();
        };
        if (changed.has ('onlyShowGap')) {
            onlyShowGap = changed.get('onlyShowGap');
        };
        if (changed.has('startDistance')) {
            startDistance = changed.get('startDistance');
        }
        
    });
    const openSegmentButton = document.getElementById("openSegmentButton");
    openSegmentButton.addEventListener("click", (e) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".fit";
        input.addEventListener("change", async (e) => {
            //currentSegmentData = await decodeLiveSegmentFile(e);       
            currentSegmentData = await decodeActivityFile(e);
            console.log("currentSegmentData", currentSegmentData);
            segmentGoalTime = currentSegmentData.at(-1).timeMs;
            segmentDistance = currentSegmentData.at(-1).distance - currentSegmentData[0].distance;
            let segmentWorld;
            let closest = Infinity;
            for (let world of worldList) {
                const distToWorld = haversineDistance(currentSegmentData[0].lat, currentSegmentData[0].lon, world.latOffset, world.lonOffset);
                if (distToWorld < closest) {
                    segmentWorld = world;
                    closest = distToWorld
                };
            }
            //const segmentWorld = worldList.find(world => findWorld(currentSegmentData[0].lat, currentSegmentData[0].lon, world));
            console.log("segmentWorld", segmentWorld)
            if (segmentWorld) {
                segmentCourseId = segmentWorld.courseId;
                segmentCourseRoads = await zen.generateRoadData(segmentCourseId);
                segmentWorldMeta = worldList.find(x => x.courseId === segmentCourseId);
                let p = 0;
                const point = {
                    lat: currentSegmentData[p].lat,
                    lng: currentSegmentData[p].lon,
                    altitude: currentSegmentData[p].altitude
                };
                const startRoad = zen.pointToRoad(point, segmentWorldMeta, segmentCourseRoads);
                if (startRoad.length === 1) {
                    console.log("startPoint1", startRoad);
                    p++;
                    const point2 = {
                        lat: currentSegmentData[p].lat,
                        lng: currentSegmentData[p].lon,
                        altitude: currentSegmentData[p].altitude
                    };
                    const startRoadPt2 = zen.pointToRoad(point2, segmentWorldMeta, segmentCourseRoads);
                    console.log("startPoint2", startRoadPt2)
                    const reverse = startRoadPt2[0].rp < startRoad[0].rp;
                    sauceStartPoint = {
                        roadId: startRoad[0].roadId,
                        rp: startRoad[0].rp,
                        reverse: reverse
                    };
                } else { //ambiguous start road
                    //debugger
                }
                console.log("startPoint", sauceStartPoint)
            }
            segmentTracker = new SegmentTracker(currentSegmentData);
        });
        input.click();
    });
    const helpButton = document.getElementById("helpButton");
    helpButton.addEventListener("click", () => {
        window.open("segment-tracker-help.html?width=850&height=900&child-window");
    })
}




export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
