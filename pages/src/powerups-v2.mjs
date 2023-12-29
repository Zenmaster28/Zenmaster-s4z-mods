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
    sortByActive: true
});

let powerupData = [
    {
        "name": "LIGHTNESS",
        "image": "feather.png",
        "count": 0
    },
    {
        "name": "POWERUP_CNT",
        "image": "coffee.png",
        "count": 0
    },
    {
        "name": "AERO",
        "image": "aero.png",
        "count": 0
    },
    {
        "name": "DRAFTBOOST",
        "image": "draft.png",
        "count": 0
    },
    {
        "name": "UNDRAFTABLE",
        "image": "burrito.png",
        "count": 0
    },
    {
        "name": "STEAMROLLER",
        "image": "steamroller.png",
        "count": 0},
    {
        "name": "ANVIL",
        "image": "anvil.png",
        "count": 0}
]

export async function main() {    common.initInteractionListeners();
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
                beforeActive = true;
                break;
            }
        }
        const watching = watchingIndex !== null ? myGroup.slice(watchingIndex, watchingIndex + 1) : [];
        const afterWatching = watchingIndex !== null ? myGroup.slice(watchingIndex + 1) : [];
        let afterActive = false;
        for (let i = 0; i < afterWatching.length; i++) {
            if (afterWatching[i].state.activePowerUp != null)
            {
                afterActive = true;
                break;
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
                let clonePowerupData = powerupData.slice(0);                                
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
