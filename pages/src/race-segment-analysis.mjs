import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
const eventsListDiv = document.getElementById("eventsList");
const eventIdDiv = document.getElementById("eventId");
const penListDiv = document.getElementById('penList');
let courseId;
let routeId;
let eventSegmentData = {
    allSegmentResults: [],
    routeInfo: null
};
const doc = document.documentElement;
doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
doc.querySelector('#titlebar').classList.add('always-visible');

function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {        
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}

common.settingsStore.setDefault({
    onlyTotalPoints: false,
    lastKnownSG: {
        eventSubgroupId: 0,
        eventSubgroupStart: 0
    },
    showTeamBadges: true,
    badgeScale: 0.7
});

let settings = common.settingsStore.get();
console.log(settings)
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

const formatTime = (milliseconds,timePrecision) => {
    milliseconds = Math.round(milliseconds * 1000);
    const ms = milliseconds.toString().padStart(3, "0").substr(-3).slice(0,timePrecision);    
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / 1000 / 60) % 60);                
    const hours = Math.floor((milliseconds / 1000 / 60 / 60) % 60);     
    if (hours != 0)
    {
        return hours.toString() + ":" + minutes.toString().padStart(2, "0") + ":" + seconds.toString().padStart(2, "0");
    }
    if (minutes != 0)
    {
        return minutes.toString().padStart(1, "0") + ":" + seconds.toString().padStart(2, "0") + "." + ms;
    }
    else
    {
        return seconds.toString().padStart(1, "0") + "." + ms;
    }
}


function changeFontScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
}
function changeBadgeScale() {
    const doc = document.documentElement;
    doc.style.setProperty('--badge-scale', common.settingsStore.get('badgeScale') || 0.7);  
}

export async function main() {
    common.initInteractionListeners();  
    const allEvents = await common.rpc.getCachedEvents();
    const eventsSelect = document.createElement('select')
    eventsSelect.id = "eventsSelect"
    eventsSelect.style.maxWidth = '30em';
    const optChoose = document.createElement('option')
    optChoose.textContent = "Click to select an event to view";
    optChoose.value = -1;
    eventsSelect.appendChild(optChoose);
    let eventInfo;
    for (let event of allEvents) {
        const eventStartTime = new Date(event.eventStart)
        const opt = document.createElement('option')
        opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
        }) + " - " + event.name;
        opt.value = event.id
        eventsSelect.appendChild(opt)
    }
    eventsListDiv.appendChild(eventsSelect);
    const eventText = document.createElement('input');
    eventText.type = "text";
    eventText.id = "eventText";
    eventText.title = "Enter an event ID (from the URL on Zwiftpower) to find an event not in the list"
    eventText.style.width = "8em"
    eventText.placeholder = "or event ID"
    //eventsListDiv.appendChild(eventText);
    eventIdDiv.appendChild(eventText)
    eventText.addEventListener("change", async function() {
        const eventTextDiv = document.getElementById("eventText");
        let eventIdSearch = eventTextDiv.value;
        if (eventIdSearch != "") {
            eventIdSearch = parseInt(eventIdSearch)
            //const eventDetails = await common.rpc.getEvent(eventIdSearch);
            let eventDetails;
            try {
                eventDetails = await common.rpc.getEvent(eventIdSearch);
                //return await this.fetchJSON(`/api/profiles/${id}`, options);
            } catch(e) {
                console.log("EventId not found", eventIdSearch)                        
            }
            if (eventDetails) {
                const eventStartTime = new Date(eventDetails.eventStart)
                const eventsSelect = document.getElementById("eventsSelect")
                const opt = document.createElement('option')
                opt.textContent = eventStartTime.toLocaleTimeString(undefined, {
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                    timeZoneName: 'short'
                }) + " - " + eventDetails.name;
                opt.value = eventDetails.id
                eventsSelect.appendChild(opt)
                eventsSelect.value = eventDetails.id
                const event = new Event('change')
                eventsSelect.dispatchEvent(event)
            }
        }
    });
    eventsSelect.addEventListener('change', async function() {        
        if (this.value != -1) {
            penListDiv.innerHTML = "";
            eventInfo = await common.rpc.getEvent(parseInt(this.value))
            eventInfo.eventSubgroups.sort((a,b) => {
                if (a.subgroupLabel > b.subgroupLabel) return 1;
                if (a.subgroupLabel < b.subgroupLabel) return -1;
                return 0;
            })
            //debugger
            const penSelect = document.createElement('select');
            penSelect.id = "penSelect"
            if (eventInfo) {                
                //console.log(eventInfo)                
                const optText = document.createElement('option');
                optText.textContent = "Select a pen"
                optText.value = -1
                penSelect.appendChild(optText)
                for (let sg of eventInfo.eventSubgroups) {
                    const zrsRange = sg.rangeAccessLabel ? ` (${sg.rangeAccessLabel})` : "";
                    const optPen = document.createElement('option')
                    optPen.value = sg.id;
                    optPen.textContent = sg.subgroupLabel + zrsRange;
                    penSelect.appendChild(optPen)
                }
                penListDiv.appendChild(penSelect)
                //eventsListDiv.appendChild(penSelect)
            }
            penSelect.addEventListener('change', async function() {
                const sg = eventInfo.eventSubgroups.find(x => x.id == this.value)
                eventSegmentData.allSegmentResults.length = 0;
                eventSegmentData.routeInfo = null;
                if (sg) {                            
                    console.log(sg);
                    courseId = sg.courseId;
                    routeId = sg.routeId;
                    const eventEntrants = await common.rpc.getEventSubgroupEntrants(sg.id, {joined: true});
                    const eventResults = await common.rpc.getEventSubgroupResults(sg.id)
                    if (eventResults.length > 0) {
                        for (let result of eventResults) {
                            /* was hoping this would get late join start time but it doesn't seem to.
                            const isoEndDateString = result.activityData.endDate.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
                            const isoEndDate = new Date(isoEndDateString);
                            const tsEndDate = Math.floor(isoEndDate.getTime());
                            result.activityData.endTime = tsEndDate;
                            result.activityData.startTime = tsEndDate - result.activityData.durationInMilliseconds;
                            */
                            /* - very slow.  Maybe only try for late joins
                            try {
                                const activityDetails = await common.rpc.getJSON(`/api/activities/${result.activityData.activityId}`);
                                if (activityDetails) {
                                    console.log("activityDetails", activityDetails)
                                    result.activityDetails = activityDetails;
                                }
                            } catch (e) {
                                console.log("Error getting activity details", e)
                            }
                            */
                        }
                        const eventResultsIds = eventResults.flatMap(x => x.profileId);
                        console.log("eventResults", eventResults)
                        const eventStartTime = sg.eventSubgroupStart;
                        const lastFinisher = eventStartTime + eventResults.at(-1).activityData.durationInMilliseconds + 10000; // add 10 seconds to ensure we capture results right at the finish
                        const sgDistance = sg.distanceInMeters ? sg.distanceInMeters : 0;
                        const sgLaps = sg.laps ? sg.laps : 0;
                        const routeInfo = await zen.processRoute(courseId, routeId, sgLaps, sgDistance);
                        const routeSegmentFinishes = routeInfo.markLines.filter(x => x.name.includes("Finish")).flatMap(x => x.id);
                        routeInfo.segmentsInOrder = routeSegmentFinishes;
                        routeInfo.uniqueSegmentIds = zen.getUniqueValues(routeInfo.markLines, 'id')
                        eventSegmentData.routeInfo = routeInfo;
                        console.log("routeInfo", routeInfo)
                        const allSegmentResults = [];
                        for (let segmentId of routeInfo.uniqueSegmentIds) {
                            console.log("eventStartTime", eventStartTime, "lastFinisher", lastFinisher, "segmentId", segmentId)
                            for (let entrant of eventEntrants) {
                                
                            }
                            //debugger
                            const segmentResultsDuringEventTime = await common.rpc.getSegmentResults(segmentId, {from: eventStartTime, to: lastFinisher});
                            console.log("segmentResultsDuringEventTime", segmentResultsDuringEventTime);
                            const racerSegmentResults = segmentResultsDuringEventTime.filter(x => eventResultsIds.includes(x.athleteId)).map(x => ({...x, segmentId: segmentId}));
                            racerSegmentResults.sort((a,b) => a.ts - b.ts);
                            console.log("racerSegmentResults", racerSegmentResults);
                            eventSegmentData.allSegmentResults = eventSegmentData.allSegmentResults.concat(racerSegmentResults);
                        }
                    } else {
                        console.log("No results for eventSubgroupId", sg.id)
                    }
                }
                console.log("eventSegmentData", eventSegmentData);
            })
            
        }
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed; 
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        } 
        if (changed.has('fontScale')) {
            changeFontScale();
        }
        if (changed.has('badgeScale')) {
            changeBadgeScale();
        }
        settings = common.settingsStore.get();
    });
    //changeBadgeScale();
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
