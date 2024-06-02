import * as common from '/pages/src/common.mjs';
import * as fields from '/pages/src/fields.mjs';
const doc = document.documentElement;
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

common.settingsStore.setDefault({
    fontScale: 1,    
    fields: 2,
    columns: 1,
    includeFieldNames: true,
    includeUnits: true,
    fps: 1
});

common.settingsStore.addEventListener('changed', ev => {
    const changed = ev.data.changed;     
    settings = common.settingsStore.get();
});


let settings = common.settingsStore.get();
if (settings.transparentNoData) {document.body.classList = "transparent-bg"};

export async function main() {
    common.initInteractionListeners();          
    const numFields = settings.fields || 2;
    const numCols = settings.columns || 1;
    const fps = settings.fps || 1;
    const fieldRenderer = new common.Renderer(content, {fps: fps});
    
    const mapping = [];    
    const defaults = {
        f1: 'pwr-cur',
        f2: 'hr-cur'        
    };        
        
    mapping.length = 0;
    content.style.gridTemplateColumns = `repeat(${numCols}, 1fr)`;
    for (let i = 0; i < (isNaN(numFields) ? 1 : numFields); i++) {
        const id = `f${i + 1}`;
        let keyDiv = settings.includeFieldNames ? '<div class="key"></div><div id="sep">:&nbsp</div>' : '';
        let unitDiv = settings.includeUnits ? '<div class="unit"></div>' : '';
        let keyname = localStorage.getItem('XXXbrowser-def-id-datagrid.html-' + id);
        
        if (keyname) {
            keyname = keyname.replace(/"/g, '');
        }
        let keyData = fields.fields.find(x => x.id == keyname)         
        if (keyData && (keyData.key == "" || keyData.id.includes("name"))) {            
            keyDiv = settings.includeFieldNames ? '' : '';
        } else {
            keyDiv = settings.includeFieldNames ? '<div class="key"></div><div class="sep">:&nbsp</div>' : '';
        }
        content.insertAdjacentHTML('beforeend', `
            <div data-field="${id}" style="display: flex">
                ${keyDiv}<div class="value"></div>${unitDiv}
            </div>
        `);
        
        mapping.push({id, default: defaults[id] || 'pwr-cur'});
    }      
    fieldRenderer.addRotatingFields({
        mapping,
        fields: fields.fields

    });
    fieldRenderer.fields.forEach((data, dataFields) => {        
        let keyData = fields.fields.find(x => x.id == data.active.id)
        if (keyData && settings.includeFieldNames && (keyData.key == "" || keyData.id.includes("name"))) {                        
            data.el.getElementsByClassName("sep")[0].innerHTML = "" // take out the : if no key name            
        }
    })
    
    common.subscribe('athlete/watching', watching => {
        doc.style.setProperty('--font-scale', common.settingsStore.get('fontScale') || 1);         
        fieldRenderer.setData(watching);
        fieldRenderer.render();          
    });    

    common.subscribe('watching-athlete-change', async athleteId => {
        console.log("Watching athlete changed")        
        
    });
    common.settingsStore.addEventListener('changed', ev => {
        const changed = ev.data.changed;         
        if (changed.has('solidBackground') || changed.has('backgroundColor')) {            
            setBackground();
        }
        if (changed.has("fields") ||
            changed.has("columns") ||
            changed.has("includeUnits") ||
            changed.has("includeFieldNames")            
        ) {
            location.reload()        
        } else if (changed.has("fps")) {
            fieldRenderer.fps = changed.get("fps")
        }
        
    });
}




export async function settingsMain() {
    common.initInteractionListeners();
    (await common.initSettingsForm('form'))();

}

setBackground();
