import * as common from '/pages/src/common.mjs';
const fieldsKey = 'powerup-settings-v3';
const doc = document.documentElement;
let curGroups;
let fieldStates;

common.settingsStore.setDefault({    
    overlayMode: false,
    fontScale: 1,
    solidBackground: false,
    backgroundColor: '#00ff00',
    hideHeader: false,
    splitFrontBehind: false,
    sortByActive: true,
    includeAero: true,
    includeDraft: true,
    includeFeather: true,
    includeBurrito: true,
    includeSteamroller: true,
    includeAnvil: true,
    includeCoffee: true
});
let settings = common.settingsStore.get();
let powerupData = [
    {
        "name": "LIGHTNESS",
        "image": "feather.png",
        "count": 0,
        "include": typeof(settings.includeFeather) == "undefined" ? true : settings.includeFeather
    },
    {
        "name": "POWERUP_CNT",
        "image": "coffee.png",
        "count": 0,
        "include": typeof(settings.includeCoffee) == "undefined" ? true : settings.includeCoffee
    },
    {
        "name": "COFFEE_STOP",
        "image": "coffee.png",
        "count": 0,
        "include": typeof(settings.includeCoffee) == "undefined" ? true : settings.includeCoffee
    },
    {
        "name": "AERO",
        "image": "aero.png",
        "count": 0,
        "include": typeof(settings.includeAero) == "undefined" ? true : settings.includeAero
    },
    {
        "name": "DRAFTBOOST",
        "image": "draft.png",
        "count": 0,
        "include": typeof(settings.includeDraft) == "undefined" ? true : settings.includeDraft
    },
    {
        "name": "UNDRAFTABLE",
        "image": "burrito.png",
        "count": 0,
        "include": typeof(settings.includeBurrito) == "undefined" ? true : settings.includeBurrito
    },
    {
        "name": "STEAMROLLER",
        "image": "steamroller.png",
        "count": 0,
        "include": typeof(settings.includeSteamroller) == "undefined" ? true : settings.includeSteamroller
    },
    {
        "name": "ANVIL",
        "image": "anvil.png",
        "count": 0,
        "include": typeof(settings.includeAnvil) == "undefined" ? true : settings.includeAnvil
    }
]
console.log(powerupData)
export async function main() {    
    common.initInteractionListeners();
    //contentEl = document.querySelector('#content');
    doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);
    common.subscribe('groups', groups => {
        if (!groups.length) {
            return;
        }
        curGroups = groups;
        doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);
        let splitFrontBehind = common.settingsStore.get('splitFrontBehind');
        let sortByActive = common.settingsStore.get('sortByActive');
        const groupCenterIdx = groups.findIndex(x => x.watching);
        var myGroup = curGroups[groupCenterIdx].athletes;  
        //console.log(myGroup);
        let watchingIndex = null;
        if (splitFrontBehind)
        {
            
            for (let i = 0; i < myGroup.length; i++) {
                if (myGroup[i].watching === true) {
                    watchingIndex = i;
                    break;
                }
            }
        }
        else
        {
            watchingIndex = 99999;            
        }
        const beforeWatching = watchingIndex !== null ? myGroup.slice(0, watchingIndex) : myGroup;
        let beforeActive = false;
        for (let i = 0; i < beforeWatching.length; i++) {            
            if (beforeWatching[i].state.activePowerUp != null)
            {
                let includePU = powerupData.find(x => x.name == beforeWatching[i].state.activePowerUp)
                if (includePU.include) {
                    beforeActive = true;
                    break;
                }
            }
        }
        const watching = watchingIndex !== null ? myGroup.slice(watchingIndex, watchingIndex + 1) : [];
        const afterWatching = watchingIndex !== null ? myGroup.slice(watchingIndex + 1) : [];
        let afterActive = false;
        for (let i = 0; i < afterWatching.length; i++) {
            if (afterWatching[i].state.activePowerUp != null)
            {
                let includePU = powerupData.find(x => x.name == afterWatching[i].state.activePowerUp)
                if (includePU.include) {
                    afterActive = true;
                    break;
                }
            }
        }        
        const data = [
            beforeWatching,
            watching,
            afterWatching
        ]
                
        var powerupTable = document.getElementById("powerupTable");
        powerupTable.innerHTML = "";
        
        for (let grouping of data)
        {                
            if (grouping.length > 0)
                {
                if (grouping[0].watching == true && beforeActive == true)
                {
                    let tbodyRow = powerupTable.insertRow();
                    let cell = tbodyRow.insertCell();
                    let text = document.createTextNode('\u25B3');
                    cell.style.textAlign = "center";
                    cell.appendChild(text);
                    cell = tbodyRow.insertCell();                       
                }
                //debugger
                let clonePowerupData = powerupData.slice(0).filter(x => x.include);                                
                for (let powerup of clonePowerupData)
                {                    
                    powerup.count = grouping.filter(x => x.state.activePowerUp == powerup.name).length;
                }   
                if (sortByActive)             
                {
                    clonePowerupData.sort((a, b) => {
                        return b.count - a.count;
                    })                
                }
                //var i = 0;                
                for (let powerup of clonePowerupData)       
                {
                    if (powerup.count > 0)
                    {
                        let tbodyRow = powerupTable.insertRow();
                        let cell = tbodyRow.insertCell();
                        let img = document.createElement("img");
                        img.src = "./images/" + powerup.image;
                        cell.appendChild(img);
                        cell = tbodyRow.insertCell();
                        if (grouping[0].watching == true && grouping[0].self == true)
                        {
                            var text = document.createTextNode('\u2606');
                        }
                        else if (grouping[0].watching == true && grouping[0].self != true)
                        {
                            var text = document.createTextNode('\u2606');
                        }
                        else
                        {
                            var text = document.createTextNode(powerup.count);
                        }
                        cell.appendChild(text);
                    }
                }
                if (grouping[0].watching == true && afterActive == true)
                {
                    let tbodyRow = powerupTable.insertRow();
                    let cell = tbodyRow.insertCell();
                    let text = document.createTextNode('\u25BD');
                    cell.style.textAlign = "center";
                    cell.appendChild(text);
                    cell = tbodyRow.insertCell();                      
                }
            }
        };
    });
    common.settingsStore.addEventListener('changed', ev => {
        location.reload() 
    });
}


export async function settingsMain() {
    common.initInteractionListeners();
    fieldStates = common.storage.get(fieldsKey);
    const form = document.querySelector('form#fields');
    form.addEventListener('input', ev => {
        const el = ev.target;
        const id = el.name;
        if (!id) {
            return;
        }
        fieldStates[id] = el.type === 'checkbox' ?
            el.checked :
            el.type === 'number' ?
                Number(el.value) : el.value;
        el.closest('.field').classList.toggle('disabled', !fieldStates[id]);
        common.storage.set(fieldsKey, fieldStates);
    });
    form.addEventListener('click', ev => {
        const el = ev.target.closest('.button[data-action]');
        if (!el) {
            return;
        }
        const wrapEl = el.closest('[data-id]');
        const key = wrapEl.dataset.id + '-adj';
        const action = el.dataset.action;
        const adj = action === 'moveLeft' ? -1 : 1;
        const value = (fieldStates[key] || 0) + adj;
        fieldStates[key] = value;
        common.storage.set(fieldsKey, fieldStates);
        wrapEl.querySelector('.col-adj .value').textContent = value;
    });
    
    await common.initSettingsForm('form#options')();
}
