import * as common from '/pages/src/common.mjs';
import * as zen from './segments-xCoord.mjs';
let dbSegmentConfig = await zen.openSegmentConfigDB();
const doc = document.documentElement;
document.body.classList.remove("transparent-bg");
const content = document.getElementById("content")
function setBackground() {
    const {solidBackground, backgroundColor} = common.settingsStore.get();
    doc.classList.toggle('solid-background', !!solidBackground);
    if (solidBackground) {        
        doc.style.setProperty('--background-color', backgroundColor);
    } else {
        doc.style.removeProperty('--background-color');
    }
}
async function loadSavedScoreFormats(action) {    
    const zenScoreFormats = zen.scoreFormats;
    const dbScoreFormats = await zen.getSavedScoreFormats(dbSegmentConfig);
    const scoreFormats = [...zenScoreFormats, ...dbScoreFormats]
    scoreFormats.sort((a,b) => a.name.localeCompare(b.name));
    console.log("merged score formats", scoreFormats)    
    savedFormatsSelect.options.length = 1;
    //jsonTextarea.value = "";
    for (let format of scoreFormats) {
        const opt = document.createElement("option")
        opt.value = format.name
        opt.text = format.name
        savedFormatsSelect.appendChild(opt)
    }
    if (action == "delete") {
        savedFormatsSelect.value = -1;
        formatName.value = ""; 
        common.settingsStore.set("formatsChanged", true)
    } else if (action == "save") {
        savedFormatsSelect.value = formatName.value;
        common.settingsStore.set("formatsChanged", true)
    }
    return scoreFormats;
}
common.settingsStore.setDefault({
    fontScale: 1,
});
common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
const savedFormatsSelect = document.getElementById("savedFormats");
const jsonTextarea = document.getElementById("jsonFormat");
//const buttonCopy = document.getElementById("buttonCopy")
const buttonSaveFormat = document.getElementById("buttonSaveFormat")
const inputFormatName = document.getElementById("formatName");
const buttonDeleteFormat = document.getElementById("buttonDeleteFormat")
inputFormatName.value = ""
let scoreFormats = await loadSavedScoreFormats();
console.log("scoreFormats",scoreFormats)
savedFormatsSelect.addEventListener("change", async function() {
    if (savedFormatsSelect.value == -1) {
        jsonTextarea.value = "";
        inputFormatName.value = "";
    } else {
        const zenScoreFormats = zen.scoreFormats;
        const dbScoreFormats = await zen.getSavedScoreFormats(dbSegmentConfig);
        const scoreFormats = [...zenScoreFormats, ...dbScoreFormats]
        const selectedFormat = scoreFormats.find(x => x.name == savedFormatsSelect.value)
        jsonTextarea.value = JSON.stringify(selectedFormat, null, 2)
        inputFormatName.value = selectedFormat.name
    }
    //debugger
});
buttonSaveFormat.addEventListener("click", function() {
    if (jsonTextarea.value != "") {
        let validFormat = true;
        let newFormat;
        try {
            newFormat = JSON.parse(jsonTextarea.value)
            console.log("newFormat",newFormat);
        } catch (error) {
            console.error("Invalid JSON:", error.message)
            alert(`Invalid JSON ${error.message}`);
            validFormat = false;
            return;
        }
        //debugger
        if (typeof(newFormat.name) != "string") {
            alert('Error: JSON does not contain a name property');
            validFormat = false;
            return;
        }
        const importFormat = {
            name: newFormat.name,
            fts: newFormat.fts || "",
            ftsStep: newFormat.ftsStep || "1",
            ftsBonus: newFormat.ftsBonus || "",
            fal: newFormat.fal || "",
            falStep: newFormat.falStep || "1",
            falBonus: newFormat.falBonus || "",
            fin: newFormat.fin || "",
            finStep: newFormat.finStep || "1",
            finBonus: newFormat.finBonus || ""
        }

        if (validFormat) {
            const transaction = dbSegmentConfig.transaction("scoringConfig", "readwrite");
            const store = transaction.objectStore("scoringConfig")
            const request = store.put(importFormat);
            request.onsuccess = async function () {                    
                console.log("Scoring format saved:", importFormat);  
                inputFormatName.value = importFormat.name
                scoreFormats = await loadSavedScoreFormats("save");
                    
            };
            request.onerror = function (event) {
                console.error("Failed to save scoring format:", event.target.error);
            };
        }

    } else {
        console.log("missing textarea data");
    }
});
buttonDeleteFormat.addEventListener("click", function() {
    if (formatName.value != "") {
        const transaction = dbSegmentConfig.transaction("scoringConfig", "readwrite");
        const store = transaction.objectStore("scoringConfig");
        const request = store.delete(formatName.value);
        request.onsuccess = async function () {
            console.log(`Deleted entry with name: ${formatName.value}`);
            scoreFormats = await loadSavedScoreFormats("delete"); 
        };
    
        request.onerror = function () {
            console.error("Error deleting entry:", request.error);
        };
    } else {
        console.log("Format name is empty")
    }
});
export async function main() {
    common.initInteractionListeners();      
    
    
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }        
        
    });
}

export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
