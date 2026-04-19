import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
//zen.buildPointsForm();
//zen.buildSegmentsTable()
let sgStartTime;
let sgSortOrder = {
    column: "name",
    ascending: true
};
let dbTeams = await zen.openTeamsDB();
import {settingsMain} from './points-leaderboard.mjs';
settingsMain();
document.body.classList.remove("transparent-bg");
const scoreFormatDiv = document.getElementById("scoreFormats");
const doc = document.documentElement;
//doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);  
doc.style.setProperty('--font-scale', 1.5);  
let drsTeams;
const drsInfoDiv = document.getElementById("drsInfo");
const drsImportDiv = document.getElementById("drsImport");
if (drsInfoDiv) {
    drsInfoDiv.addEventListener("click", () => {
        drsImportDiv.classList.remove("hidden");
    });
};
const importCloseButton = document.getElementById("importClose");
if (importCloseButton) {
    importCloseButton.addEventListener("click", () => {
        drsImportDiv.classList.add("hidden");
    });
};
const openJsonButton = document.getElementById("importDrsTeamsButton");
if (openJsonButton) {
    openJsonButton.addEventListener("click", () => {
        const eventId = document.getElementById("eventsSelect").value;
        window.open(`https://www.dirtracingseries.com/teams/saucedata/v1/${eventId}/`);
    });
};
const importTextArea = document.getElementById("importText");
if (importTextArea) {
    importTextArea.addEventListener("paste", (e) => {
        const drsPensDiv = document.getElementById("drsPens");
        const jsonRawData = e.clipboardData.getData('text');
        try {
            drsTeams = JSON.parse(jsonRawData);
        } catch {
            console.log("Invalid JSON")
            drsPensDiv.innerHTML = "Error reading the data.  Try copying the data again and ensure you capture everything.  Ctrl/Cmd - A to select all and then Ctrl-Cmd - C to copy."
            return;
        }
        console.log("drsTeams", drsTeams);
        
        drsPensDiv.innerHTML = "";
        let pensOutput = "";
        for (let pen of drsTeams.pens) {
            pensOutput += `<input id="${pen.pen}" name="penCb" type="radio">${pen.pen} - ${pen.category}<br>`
        };
        drsPensDiv.innerHTML = pensOutput;
        importDrsSaveButton.style.display = "block";
    })
}
const importDrsSaveButton = document.getElementById("importDrsSaveButton");
const duplicateWarningDiv = document.getElementById("duplicateWarning");
if (importDrsSaveButton) {
    importDrsSaveButton.addEventListener("click", async () => {
        const pensToSave = document.querySelectorAll('[name="penCb"]');
        let drsTeamsToSave = [];
        for (let pen of pensToSave) {
            if (pen.checked) {
                const drsPen = drsTeams.pens.find(x => x.pen === pen.id);
                drsTeamsToSave.push(drsPen);
            }
        }
        console.log("drsTeamsToSave", drsTeamsToSave);
        let existingTeams = await zen.getExistingTeams(dbTeams);
        console.log("existingTeams", existingTeams);
        let duplicates = [];
        for (let pen of drsTeamsToSave) {
            const sanitizedPen = assignTeamNames(pen.teams);
            console.log("sanitizedPen", sanitizedPen);
            const penDuplicates = await findDuplicateAssignments(sanitizedPen);
            penDuplicates.forEach(dup => duplicates.push(dup));
            console.log("penDuplicates", penDuplicates)
            for (let team of sanitizedPen) {
                const existingCheck = existingTeams.find(x => x.team === team.teamName);
                if (!existingCheck) {                    
                    console.log("Creating new team", team.teamName)
                    await newTeam(team.teamName);
                };
            };
            existingTeams = await zen.getExistingTeams(dbTeams);
            console.log("existingTeams", existingTeams);
            for (let team of sanitizedPen) {
                const dbTeam = existingTeams.find(x => x.team === team.teamName);
                if (dbTeam) {
                    for (let rider of team.riders) {
                        zen.assignAthlete(dbTeams, dbTeam.id, rider.zwift_id);
                    };
                } else {
                    console.warn("Missing team data!")
                    debugger
                };
            };            
        }
        if (duplicates.length > 0) {
            console.log("all duplicates", duplicates)
            let duplicateWarning = `WARNING: The following riders belong to more than one team and may not be assigned correctly.  <br>
                <table>
                    <tr><th>Name</th><th>Assigned Team</th><th>Possible Teams</th></tr>
                `
            const existingAssignments = await zen.getTeamAssignments(dbTeams);
            existingTeams = await zen.getExistingTeams(dbTeams);
            for (let dup of duplicates) {
                const thisDup = existingAssignments.find(x => x.athleteId === dup.zwift_id);
                const thisDupTeam = existingTeams.find(x => x.id === thisDup.team);
                let possibleTeams = "";
                dup.teams.forEach(x => possibleTeams += `${x}, `)
                duplicateWarning += `<tr><td>${dup.name}</td><td>${thisDupTeam.team}</td><td>${possibleTeams}</td></tr>`
            };            
            duplicateWarning += "</table>"
            duplicateWarningDiv.innerHTML = duplicateWarning;
            duplicateWarningDiv.classList.remove("hidden");

        } else {
            duplicateWarningDiv.classList.add("hidden");
        }
        await refreshTeams();
        importCloseButton.click();
    })
};
function normalize(str) {
    const stripRegex = /[()\[\]{}]/g;
    return typeof str === "string"
        ? str.replace(stripRegex, "").trim()
        : "";
}
async function findDuplicateAssignments(pen) {
    const riderMap = new Map();

    for (const team of pen) {
        const { teamName, riders } = team;

        for (const rider of riders) {
            const { zwift_id } = rider;

            if (!riderMap.has(zwift_id)) {
                riderMap.set(zwift_id, new Set());
            }

            riderMap.get(zwift_id).add(teamName);
        }
    }
    
    const result = [];

    for (const [zwift_id, teams] of riderMap.entries()) {
        if (teams.size > 1) {
            const athlete = await common.rpc.getAthlete(zwift_id);
            console.log("duplicate athlete", athlete)
            result.push({
            zwift_id,
            name: athlete.sanitizedFullname ?? zwift_id,
            teams: [...teams]
            });
        }
    }

    return result;

}

function assignTeamNames(pen) {
    const counts = new Map();
    
    for (const team of pen) {
        const normalizedTag = normalize(team.in_game_tag);
        counts.set(
            normalizedTag,
            (counts.get(normalizedTag) || 0) + 1
        );
    }

    for (const team of pen) {
        const normalizedTag = normalize(team.in_game_tag);

        if (counts.get(normalizedTag) === 1) {
            team.teamName = normalizedTag;
        } else if (normalize(team.team_name).startsWith(normalizedTag)) {
            const newName = normalize(team.team_name).replace(normalizedTag, "").trim();
            team.teamName = newName;
        } else {
            team.teamName = normalize(team.team_name);
        }
    }

    return pen;
};
const resetAllTeamsButton = document.getElementById("resetTeamsDb");
if (resetAllTeamsButton) {
    resetAllTeamsButton.addEventListener("click", async () => {
        if (confirm(`WARNING: This will delete ALL teams and their member assignments!!  Do you want to continue?`)) {
            const allTeams = await zen.getExistingTeams(dbTeams);
            const teamAssignments = await zen.getTeamAssignments(dbTeams);
            for (let team of allTeams) {            
                const thisTeam = allTeams.find(x => x.team === team.team);
                const thisTeamMembers = teamAssignments.filter(x => x.team === thisTeam.id);                
                for (let member of thisTeamMembers) {
                    zen.assignAthlete(dbTeams, "-1", member.athleteId)
                };                
                await zen.deleteTeam(dbTeams, team.id);
            };
            await refreshTeams();
        };
        duplicateWarningDiv.classList.add("hidden");
    });
}
const eventsListDiv = document.getElementById("eventsList");
const allEvents = await common.rpc.getCachedEvents();
const eventsSelect = document.createElement('select')
eventsSelect.id = "eventsSelect"
eventsSelect.style.maxWidth = '27em';
const optChoose = document.createElement('option')
optChoose.textContent = "Click to select an event";
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
eventsListDiv.appendChild(eventsSelect)
const eventText = document.createElement('input');
eventText.type = "text";
eventText.id = "eventText";
eventText.title = "Enter an event ID (from the URL on Zwiftpower) to find an event not in the list"
eventText.style.width = "6em"
eventText.placeholder = "or event ID"
eventsListDiv.appendChild(eventText);
eventText.addEventListener("change", async function() {
    const eventTextDiv = document.getElementById("eventText");
    duplicateWarningDiv.classList.add("hidden");
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
})
const watching = await common.rpc.getAthleteData("watching")

const penListDiv = document.getElementById('penList');
const eventTextDiv = document.getElementById('eventText'); 

eventsSelect.addEventListener('change', async function() {
    duplicateWarningDiv.classList.add("hidden");
    penListDiv.innerHTML = "";    
    eventTextDiv.value = "";
    if (this.value != -1) {
        eventInfo = await common.rpc.getEvent(parseInt(this.value))
        eventInfo.eventSubgroups.sort((a,b) => {
            if (a.subgroupLabel > b.subgroupLabel) return 1;
            if (a.subgroupLabel < b.subgroupLabel) return -1;
            return 0;
        });
        const penSelect = document.createElement('select');
        penSelect.id = "penSelect"
        if (eventInfo) {
            sgStartTime = eventInfo.ts;
            console.log(eventInfo)
            if (eventInfo.allTagsObject.dirtracingseries) {
                document.getElementById("drsDisplay").style.display = "flex";
            } else {
                document.getElementById("drsDisplay").style.display = "none";
            }
            const optText = document.createElement('option');
            optText.textContent = "Select a pen"
            optText.value = -1
            penSelect.appendChild(optText)
            for (let sg of eventInfo.eventSubgroups) {
                const optPen = document.createElement('option')
                optPen.value = sg.id;
                optPen.textContent = sg.subgroupLabel;
                penSelect.appendChild(optPen)
            }
            penListDiv.appendChild(penSelect)
        }
        penSelect.addEventListener('change', async function() {
            duplicateWarningDiv.classList.add("hidden");
            const sg = eventInfo.eventSubgroups.find(x => x.id == this.value)
            const outputDiv = document.getElementById("outputDiv")
            if (sg) {   
                const sgEntrants = await common.rpc.getEventSubgroupEntrants(sg.id)
                /*
                sgEntrants.sort((a,b) => {
                    if (a.athlete.sanitizedFullname < b.athlete.sanitizedFullname) {
                        return -1
                    } else {
                        return 1
                    }
                })
                console.log("sgEntrants", sgEntrants)
                */
                //debugger
                const arrowSymbol = sgSortOrder.ascending ? "&nbsp;&#x25B2;" : "&nbsp;&#x25BC;";
                let tableOutput = `<table id='sgEntrantsTable'><th data-col='name'>Name${sgSortOrder.column === "name" ? arrowSymbol : ""}</th><th data-col='zwiftTeam'>Team${sgSortOrder.column === "zwiftTeam" ? arrowSymbol : ""}</th><th data-col='customTeam'>Custom Team${sgSortOrder.column === "customTeam" ? arrowSymbol : ""}</th>`
                const customTeams = await zen.getExistingTeams(dbTeams);
                customTeams.sort((a,b) => a.team.localeCompare(b.team, undefined, {sensitivity: 'case'}));
                const teamAssignments = await zen.getTeamAssignments(dbTeams);
                console.log("customTeams", customTeams)
                console.log("teamAssignments", teamAssignments)
                for (let entrant of sgEntrants) {
                    const zenTeam = teamAssignments.find(x => x.athleteId == entrant.athlete.id);
                    if (zenTeam) {
                        const zenTeamData = customTeams.find(x => x.id === parseInt(zenTeam.team));
                        if (zenTeamData) {
                            entrant.zenTeamName = zenTeamData.team;
                            entrant.zenTeamId = zenTeamData.id;
                        }
                    }
                    if (!entrant.athlete.team) {
                        entrant.athlete.team = ""
                    }
                }
                console.log("sgEntrants", sgEntrants)
                //sgSortOrder.column = "customTeam";
                //sgSortOrder.ascending = false;
                sgEntrants.sort((a,b) => {
                    if (sgSortOrder.column === "name") {
                        const comp = a.athlete.sanitizedFullname.localeCompare(b.athlete.sanitizedFullname, undefined, {sensitivity: "case", numeric: true});
                        return sgSortOrder.ascending ? comp : -comp;
                    } else if (sgSortOrder.column === "zwiftTeam") { 
                        if (a.athlete.team && !b.athlete.team) {
                            return -1;
                        } else if (!a.athlete.team && b.athlete.team) {
                            return 1;
                        } else if (!a.athlete.team && !b.athlete.team) {
                            const comp = a.athlete.sanitizedFullname.localeCompare(b.athlete.sanitizedFullname, undefined, {sensitivity: "case", numeric: true});
                            return sgSortOrder.ascending ? comp : -comp;
                        }
                        const comp = a.athlete.team?.localeCompare(b.athlete.team, undefined, {sensitivity: "base", numeric: true});
                        return sgSortOrder.ascending ? comp : -comp;
                    } else if (sgSortOrder.column === "customTeam") {
                        if (a.zenTeamName && !b.zenTeamName) {
                            return -1;
                        } else if (!a.zenTeamName && b.zenTeamName) {
                            return 1;
                        } else if (!a.zenTeamName && !b.zenTeamName) {
                            const comp = a.athlete.sanitizedFullname.localeCompare(b.athlete.sanitizedFullname, undefined, {sensitivity: "case", numeric: true});
                            return sgSortOrder.ascending ? comp : -comp;
                        }
                        const comp = a.zenTeamName?.localeCompare(b.zenTeamName, undefined, {sensitivity: "case", numeric: true});
                        return sgSortOrder.ascending ? comp : -comp;
                    }
                });
                
                for (let entrant of sgEntrants) {
                    //debugger
                    const zenTeam = teamAssignments.find(x => x.athleteId == entrant.athlete.id)          
                    let select = `<select name='customTeamSelect'><option value='-1,${entrant.athlete.id}'>---</option>`
                    for (let team of customTeams) {
                        if (zenTeam && zenTeam.team == team.id && zenTeam.athleteId == entrant.athlete.id) {
                            select += `<option value='${team.id},${entrant.athlete.id}' selected>${team.team}</option>`
                        } else {
                            select += `<option value='${team.id},${entrant.athlete.id}'>${team.team}</option>`
                        }
                    }
                    select += "</select>"
                    
                    tableOutput += `<tr><td>${entrant.athlete.sanitizedFullname}</td><td>${entrant.athlete.team || ""}</td><td>${select}</td></tr>`
                }
                tableOutput += "</table>"
                outputDiv.innerHTML = tableOutput;
                const teamSelects = document.querySelectorAll('select[name="customTeamSelect"]');
                teamSelects.forEach(select => {
                    select.addEventListener('change', async event => {
                        duplicateWarningDiv.classList.add("hidden");
                        const [id, athleteId] = event.target.value.split(",");
                        zen.assignAthlete(dbTeams, id, athleteId);
                        existingTeamsDiv.innerHTML = await getExistingTeams();
                        const teamsTable = document.getElementById("existingTeamsTable");
                        for (let row of teamsTable.rows) {
                            row.addEventListener("click", function () {
                                duplicateWarningDiv.classList.add("hidden");
                                const id = this.cells[0].textContent;
                                const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
                                showTeamMembers(id, team)
                            })
                        }
                    });
                });
                const tableHeaders = document.getElementById("sgEntrantsTable").querySelectorAll("th");
                tableHeaders.forEach(th => {
                    th.addEventListener("click", () => {
                        if (sgSortOrder.column != th.dataset.col) {
                            sgSortOrder.column = th.dataset.col;
                        } else {
                            sgSortOrder.ascending = !sgSortOrder.ascending;
                        };
                        const event = new Event('change');
                        penSelect.dispatchEvent(event);
                    })
                })
            }
            //debugger
        })
        if (watching) {
            const eventSubgroupId = watching.state.eventSubgroupId;
            if (eventSubgroupId > 0) {
                const validOption = Array.from(penSelect.options).some(option => option.value == eventSubgroupId)
                if (validOption) {
                    penSelect.value = eventSubgroupId
                    const event = new Event('change')
                    penSelect.dispatchEvent(event)
                }
            } else {
                const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
                if (signedUp.length > 0) {
                    //debugger
                    //console.log("Selecting pen")
                    const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
                    console.log(sg)
                    const validOption = Array.from(penSelect.options).some(option => option.value == sg.id)
                    if (validOption) {
                        penSelect.value = sg.id
                        const event = new Event('change')
                        penSelect.dispatchEvent(event)
                    }
                }
            }
            //debugger
        }
    }
});

const newTeamInput = document.getElementById("newTeamName");
const addNewTeamButton = document.getElementById("addNewTeam");
async function refreshTeams() {
    existingTeamsDiv.innerHTML = await getExistingTeams();
    const teamsTable = document.getElementById("existingTeamsTable");
    const outputDiv = document.getElementById("outputDiv")
    outputDiv.innerHTML = "";
    for (let row of teamsTable.rows) {
        row.addEventListener("click", function () {
            duplicateWarningDiv.classList.add("hidden");
            const id = this.cells[0].textContent;
            const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
            showTeamMembers(id, team)
        })
    }
}
async function newTeam(name) {
    const teamName = name ? name : newTeamInput.value.trim();
    await zen.addNewTeam(dbTeams, teamName);
    existingTeamsDiv.innerHTML = await getExistingTeams();
    const teamsTable = document.getElementById("existingTeamsTable");
    duplicateWarningDiv.classList.add("hidden");
    for (let row of teamsTable.rows) {
        row.addEventListener("click", function () {
            duplicateWarningDiv.classList.add("hidden");
            const id = this.cells[0].textContent;
            const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
            showTeamMembers(id, team)
        })
    };
    if (penSelect.value != "-1") {
        const event = new Event('change');
        penSelect.dispatchEvent(event);
    }
}
addNewTeamButton.addEventListener("click", async function() {
    await newTeam();
});
newTeamInput.addEventListener("keydown", async function(event) {
    if (event.key === "Enter") {
        await newTeam();
    }
})
const existingTeamsDiv = document.getElementById("existingTeamsDiv")
async function getExistingTeams() {
    const existingTeams = await zen.getExistingTeams(dbTeams);  
    const teamAssignments = await zen.getTeamAssignments(dbTeams); 
    existingTeams.sort((a,b) => a.team.localeCompare(b.team, undefined, {sensitivity: 'case'}));
    console.log("existingTeams", existingTeams) 
    
    let existingTeamsTable = "<table id='existingTeamsTable'><th>Id</th><th>Name</th><th></th>"
    for (let team of existingTeams) {
        const teamMemberCount = (teamAssignments.filter(x => x.team == team.id)).length
        existingTeamsTable += `<tr><td>${team.id}</td><td class="teamName">${team.team} (${teamMemberCount})</td><td>${team.badge}</td></tr>`
    }
    existingTeamsTable += "</table>"
    return existingTeamsTable
}
existingTeamsDiv.innerHTML = await getExistingTeams();
const teamsTable = document.getElementById("existingTeamsTable");
for (let row of teamsTable.rows) {
    row.addEventListener("click", function () {
        duplicateWarningDiv.classList.add("hidden");
        const id = this.cells[0].textContent;
        const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
        showTeamMembers(id, team)
    })
}
async function addNewMember(team, teamName) {
    const athleteId = document.getElementById("newTeamMember").value;
    zen.assignAthlete(dbTeams, team, athleteId);
    showTeamMembers(team, teamName);
    const existingTeamsDiv = document.getElementById("existingTeamsDiv");
    existingTeamsDiv.innerHTML = await getExistingTeams();
    const teamsTable = document.getElementById("existingTeamsTable");
    for (let row of teamsTable.rows) {
        row.addEventListener("click", function () {
            duplicateWarningDiv.classList.add("hidden");
            const id = this.cells[0].textContent;
            const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
            showTeamMembers(id, team)
        })
    }
}

async function showTeamMembers(team, teamName) {
    //const penSelect = document.getElementById('penSelect');
    //penSelect.value = "-1"
    const eventSelect = document.getElementById('eventsSelect');
    eventsSelect.value = "-1"
    const event = new Event('change')
    eventsSelect.dispatchEvent(event)
    const teamAssignments = await zen.getTeamAssignments(dbTeams);
    console.log("teamAssignments", teamAssignments)
    const thisTeam = teamAssignments.filter(x => x.team == team)
    //debugger
    console.log("This team:", thisTeam)
    outputDiv.innerHTML = `<input type="text" id="newTeamMember" placeholder="Zwift ID to add"/>
        <button id="addNewTeamMember">Add to ${teamName}</button>
        <button id="clearTeamButton">Remove All</button>
        <button id="deleteTeamButton">Delete ${teamName}</button>
        `;
    let thisTeamTable = `<hr><table id='thisTeamTable'><th>Name</th><th>Team from Zwift</th><th>athleteId</th><th>Remove from ${teamName}</th>`
    for (let athlete of thisTeam) {
        const athleteData = await common.rpc.getAthlete(athlete.athleteId);
        thisTeamTable += `<tr><td>${athleteData?.sanitizedFullname}</td><td>${athleteData?.team || ""}</td><td>${athlete.athleteId}</td><td>X</td></tr>`
    }
    thisTeamTable += "</table>";
    outputDiv.innerHTML += thisTeamTable;
    const addNewMemberButton = document.getElementById("addNewTeamMember");
    const removeAllButton = document.getElementById("clearTeamButton");
    const deleteTeamButton = document.getElementById("deleteTeamButton");
    
    addNewMemberButton.addEventListener("click", async function () {
        duplicateWarningDiv.classList.add("hidden");
        await addNewMember(team, teamName)
    });
    const addNewMemberInput = document.getElementById('newTeamMember');
    addNewMemberInput.addEventListener("keydown", async function(event) {
        if (event.key === "Enter") {
            duplicateWarningDiv.classList.add("hidden");
            await addNewMember(team, teamName)
        }
    });
    removeAllButton.addEventListener("click", async function () {
        if (confirm(`Delete all members from ${teamName}?`)) {
            duplicateWarningDiv.classList.add("hidden");
            const teamAssignments = await zen.getTeamAssignments(dbTeams);        
            const thisTeam = teamAssignments.filter(x => x.team == team)
            for (let member of thisTeam) {
                zen.assignAthlete(dbTeams, "-1", member.athleteId)
            }
            existingTeamsDiv.innerHTML = await getExistingTeams();
            const teamsTable = document.getElementById("existingTeamsTable");
            for (let row of teamsTable.rows) {
                row.addEventListener("click", function () {
                    duplicateWarningDiv.classList.add("hidden");
                    const id = this.cells[0].textContent;
                    const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
                    showTeamMembers(id, team)
                })
            }
            showTeamMembers(team, teamName);
        }
    });
    deleteTeamButton.addEventListener("click", async function () {
        if (confirm(`Completely remove team ${teamName}?`)) {
            const teamAssignments = await zen.getTeamAssignments(dbTeams);        
            const thisTeam = teamAssignments.filter(x => x.team == team)
            for (let member of thisTeam) {
                zen.assignAthlete(dbTeams, "-1", member.athleteId)
            }
            await zen.deleteTeam(dbTeams, team);
            existingTeamsDiv.innerHTML = await getExistingTeams();
            const teamsTable = document.getElementById("existingTeamsTable");
            for (let row of teamsTable.rows) {
                row.addEventListener("click", function () {
                    const id = this.cells[0].textContent;
                    const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
                    showTeamMembers(id, team)
                })
            }
            outputDiv.innerHTML = "";
        }
    })
    const teamTable = document.getElementById("thisTeamTable");
    for (let row of teamTable.rows) {
        row.cells[3].addEventListener("click", async function () {
            const athleteId = this.parentElement.cells[2].textContent;
            const id = "-1";
            zen.assignAthlete(dbTeams, id, athleteId);
            showTeamMembers(team, teamName);
            const existingTeamsDiv = document.getElementById("existingTeamsDiv");
            existingTeamsDiv.innerHTML = await getExistingTeams();
            const teamsTable = document.getElementById("existingTeamsTable");
            for (let row of teamsTable.rows) {
                row.addEventListener("click", function () {
                    const id = this.cells[0].textContent;
                    const team = this.cells[1].textContent.replace(/\(\d+\)/, '').trim();
                    showTeamMembers(id, team)
                })
            }
        })
    }
};

//debugger
if (watching) {
    const eventSubgroupId = watching.state.eventSubgroupId;
    if (eventSubgroupId > 0) {
        const sg = await common.rpc.getEventSubgroup(eventSubgroupId)
        eventsSelect.value = sg.eventId
        const event = new Event('change')
        eventsSelect.dispatchEvent(event)
    } else {
        const signedUp = allEvents.filter(x => x.eventSubgroups.some(sg => sg.signedUp))
        if (signedUp.length > 0) {
            const sg = signedUp[0].eventSubgroups.find(x => x.signedUp)
            eventsSelect.value = sg.eventId
            const event = new Event('change')
            eventsSelect.dispatchEvent(event)
        }
        //debugger
    }
    //debugger
}
function saveConfig() {
    //console.log("Saving eventConfig")
    const segmentsTable = document.getElementById('segmentsTable');
    const sampleScoring = document.getElementById('sampleScoring');
    sampleScoring.innerHTML = "Sample Scoring";
    if (segmentsTable) {
        const tableRows = segmentsTable.querySelectorAll('tr')
        const segData = [];
        for (let row of tableRows) {
            const segConfig = {
                name: row.cells[0].textContent.replace(/\s\[\d+\]$/, ""),
                segmentId: row.cells[1].textContent,
                repeat: parseInt(row.cells[2].textContent),
                enabled: row.cells[3].querySelector('input').checked,
                scoreFormat: row.cells[4].querySelector('select').value
            }
            segData.push(segConfig);
        }
        const eventConfig = {
            ftsScoreFormat: document.getElementById('ftsScoreFormat').value,
            ftsStep: document.getElementById('ftsStep').value,
            ftsBonus: document.getElementById('ftsBonus').value,
            falScoreFormat: document.getElementById('falScoreFormat').value,
            falStep: document.getElementById('falStep').value,
            falBonus: document.getElementById('falBonus').value,
            finScoreFormat: document.getElementById('finScoreFormat').value,
            finStep: document.getElementById('finStep').value,
            finBonus: document.getElementById('finBonus').value,
            eventId: parseInt(document.getElementById('eventsSelect').value),
            eventSubgroupId: parseInt(document.getElementById('penSelect').value),
            segments: segData,
            ts: sgStartTime
        }
        const transaction = dbSegmentConfig.transaction("segmentConfig", "readwrite");
        const store = transaction.objectStore("segmentConfig")
        const request = store.put(eventConfig);
        request.onsuccess = function () {                    
            console.log("Event config saved:", eventConfig.eventSubgroupId, eventConfig);                        
            sampleScoring.innerHTML = showSampleScoring(eventConfig);
        };
        request.onerror = function (event) {
            console.error("Failed to save event config:", event.target.error);
        };
    } else {
        console.log("No segments defined / no pen selected")
    }
    //debugger
}
