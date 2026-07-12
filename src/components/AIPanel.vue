<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { aiState, aiSettings, generateAI, retryLastGeneration, clearConversation, testConnection, QUICK_ACTIONS, loadAISettings, saveAISettings } from '../composables/useAI.js'
import type { QuickAction, HistoryEntry } from '../composables/useAI.js'
import { usePromptTemplates } from '../composables/usePromptTemplates.js'

const props = defineProps<{ selectedText: string; documentContent: string }>()
const emit = defineEmits<{ close: []; 'insert-at-cursor': [text: string]; 'replace-selection': [text: string]; 'append-to-document': [text: string] }>()

const promptInput = ref(''); const outputEl = ref<HTMLElement | null>(null); const outputText = ref('')
const contextMode = ref<'none'|'selection'|'document'>('none')
const activeTab = ref<'generate'|'templates'|'settings'|'history'>('generate')
const showNewTemplate = ref(false); const isPinned = ref(false)
const panelWidth = ref(300); const isResizing = ref(false)
const sessionHistory = ref<HistoryEntry[]>([])
const newTplName = ref(''); const newTplIcon = ref('📌'); const newTplPrompt = ref('')
const testingProvider = ref<string|null>(null); const testResult = ref<Record<string,string|null>>({})
const { templates, loadTemplates, addTemplate, deleteTemplate } = usePromptTemplates()

const PROVIDERS = [
  { id:'mistral',label:'Mistral',sub:'Mistral AI' },
  { id:'openrouter',label:'OpenRouter',sub:'Any Model' },
  { id:'workers',label:'Workers AI',sub:'Cloudflare' },
]
const ctxLabel = computed(()=>{ if(contextMode.value==='selection')return props.selectedText?`${props.selectedText.length} chars selected`:'No selection'; if(contextMode.value==='document')return `${props.documentContent.length} chars`; return '' })
const outStats = computed(()=>{ if(!outputText.value)return ''; const w=outputText.value.trim().split(/\s+/).filter(Boolean).length; return `${w} words · ${outputText.value.length} chars` })

async function handleGenerate() { if(!promptInput.value.trim()||aiState.isGenerating.value)return; outputText.value=''; const ctx=contextMode.value==='selection'?(props.selectedText||null):contextMode.value==='document'?(props.documentContent||null):null; try{const r=await generateAI(promptInput.value.trim(),ctx,()=>{outputText.value=aiState.streamedOutput.value;nextTick(scroll)});outputText.value=r||aiState.streamedOutput.value;sessionHistory.value.unshift({id:Date.now(),prompt:promptInput.value.trim(),output:outputText.value,provider:aiState.selectedProvider.value,time:new Date().toLocaleTimeString(),duration:aiState.generationDuration.value??undefined});if(sessionHistory.value.length>15)sessionHistory.value=sessionHistory.value.slice(0,15)}catch{} }
async function handleQuickAction(a:QuickAction) { outputText.value=''; const ctx=contextMode.value==='selection'?props.selectedText:contextMode.value==='document'?props.documentContent:null; if(a.needsContext&&!ctx){promptInput.value=a.prompt;activeTab.value='generate';return}; try{const r=await generateAI(a.prompt,ctx,()=>{outputText.value=aiState.streamedOutput.value;nextTick(scroll)});outputText.value=r||aiState.streamedOutput.value;sessionHistory.value.unshift({id:Date.now(),prompt:a.prompt,output:outputText.value,provider:aiState.selectedProvider.value,time:new Date().toLocaleTimeString()})}catch{} }
async function handleRetry() { outputText.value=''; try{const r=await retryLastGeneration(()=>{outputText.value=aiState.streamedOutput.value;nextTick(scroll)});outputText.value=r||aiState.streamedOutput.value}catch{} }
function handleStop() { aiState.isGenerating.value=false }
function useTemplate(t:{prompt:string}) { promptInput.value=t.prompt; activeTab.value='generate' }
function handleSaveTemplate() { if(!newTplName.value.trim()||!newTplPrompt.value.trim())return; addTemplate(newTplName.value,newTplIcon.value,newTplPrompt.value); newTplName.value='';newTplIcon.value='📌';newTplPrompt.value='';showNewTemplate.value=false }
function insertAtCursor() { emit('insert-at-cursor',outputText.value) }
function replaceSelection() { emit('replace-selection',outputText.value) }
function appendToDoc() { emit('append-to-document',outputText.value) }
async function copyOutput() { if(outputText.value) await navigator.clipboard.writeText(outputText.value) }
async function handleTestConnection(p:string) { testingProvider.value=p;testResult.value[p]=null; try{await testConnection(p);testResult.value={...testResult.value,[p]:'success'}}catch(err){testResult.value={...testResult.value,[p]:String(err)}}finally{testingProvider.value=null} }
async function handleSaveSettings() { try{await saveAISettings()}catch{} }
function startResize(e:MouseEvent) { isResizing.value=true; const sx=e.clientX,sw=panelWidth.value; const mv=(ev:MouseEvent)=>{panelWidth.value=Math.min(520,Math.max(240,sw+(sx-ev.clientX)))}; const up=()=>{isResizing.value=false;window.removeEventListener('mousemove',mv);window.removeEventListener('mouseup',up)}; window.addEventListener('mousemove',mv);window.addEventListener('mouseup',up) }
function onPanelKeydown(e:KeyboardEvent) { if(!isPinned.value&&e.key==='Escape')emit('close') }
function onInputKeydown(e:KeyboardEvent) { if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();e.stopPropagation();handleGenerate()} }
function scroll() { if(outputEl.value)outputEl.value.scrollTop=outputEl.value.scrollHeight }
function clearOutput() { outputText.value='';aiState.error.value=null;aiState.generationDuration.value=null }
function handleClearAll() { clearConversation();clearOutput() }
onMounted(async()=>{await loadAISettings();loadTemplates()})
</script>

<template>
  <aside class="ai-panel" :class="{'ai-panel--resizing':isResizing}" :style="{width:panelWidth+'px'}" @keydown="onPanelKeydown" tabindex="-1">
    <div class="ai-panel__resize" @mousedown.prevent="startResize"/>
    <header class="ai-header"><span class="ai-header__title">Marginalia</span><span class="ai-header__spacer"/><button class="ai-header__btn" :class="{'is-active':isPinned}" @click="isPinned=!isPinned" title="Pin open">&#x25A3;</button><button class="ai-header__btn" @click="emit('close')" title="Close">&times;</button></header>
    <nav class="ai-providers"><button v-for="p in PROVIDERS" :key="p.id" class="ai-provider" :class="{'is-active':aiState.selectedProvider.value===p.id}" @click="aiState.selectedProvider.value=p.id">{{p.label}}<span class="ai-provider__sub">{{p.sub}}</span></button></nav>
    <nav class="ai-tabs"><button v-for="t in (['generate','templates','settings','history'] as const)" :key="t" class="ai-tab" :class="{'is-active':activeTab===t}" @click="activeTab=t">{{t.charAt(0).toUpperCase()+t.slice(1)}}</button></nav>
    <div v-if="activeTab==='generate'" class="ai-body">
      <div class="ai-field"><div class="ai-context-row"><button v-for="m in (['none','selection','document'] as const)" :key="m" class="ai-context-btn" :class="{'is-active':contextMode===m}" @click="contextMode=m">{{m==='none'?'Standalone':m==='selection'?'From selection':'Full document'}}</button></div><span v-if="ctxLabel" class="ai-annotation">{{ctxLabel}}</span></div>
      <div class="ai-field"><span class="ai-label">Quick actions</span><div class="ai-quick-list"><button v-for="a in QUICK_ACTIONS" :key="a.id" class="ai-quick-item" :disabled="aiState.isGenerating.value" @click="handleQuickAction(a)"><span class="ai-quick-item__icon">{{a.icon}}</span><span class="ai-quick-item__label">{{a.label}}</span></button></div></div>
      <div class="ai-field"><span class="ai-label">Prompt<kbd class="ai-kbd">Ctrl&#x21B5;</kbd></span><textarea v-model="promptInput" class="ai-textarea" rows="4" placeholder="What shall we write?" @keydown="onInputKeydown"/></div>
      <div class="ai-params"><div class="ai-param"><span class="ai-param__label">Temperature</span><span class="ai-param__val">{{aiState.temperature.value.toFixed(1)}}</span><input type="range" min="0" max="1" step="0.1" v-model.number="aiState.temperature.value"/></div><div class="ai-param"><span class="ai-param__label">Max tokens</span><span class="ai-param__val">{{aiState.maxTokens.value}}</span><input type="range" min="256" max="4096" step="256" v-model.number="aiState.maxTokens.value"/></div></div>
      <div class="ai-actions"><button v-if="!aiState.isGenerating.value" class="ai-btn ai-btn--primary" :disabled="!promptInput.trim()" @click="handleGenerate">Generate</button><button v-else class="ai-btn ai-btn--stop" @click="handleStop">Stop</button><button class="ai-btn ai-btn--muted" @click="handleClearAll" title="Clear all">Clear</button></div>
      <div v-if="aiState.error.value" class="ai-error"><p class="ai-error__msg">{{aiState.error.value}}</p><button class="ai-btn ai-btn--muted" @click="handleRetry">Retry</button></div>
      <div v-if="outputText||aiState.isGenerating.value" class="ai-output-section"><div class="ai-output-meta"><span v-if="aiState.isGenerating.value" class="ai-generating-indicator">Writing&#x2026;</span><span v-else-if="aiState.generationDuration.value" class="ai-annotation">{{aiState.generationDuration.value}}s</span><span class="ai-annotation">{{outStats}}</span></div><div class="ai-output" ref="outputEl"><pre class="ai-output__text">{{outputText}}</pre></div><div v-if="outputText&&!aiState.isGenerating.value" class="ai-output-actions"><button class="ai-btn ai-btn--muted" @click="insertAtCursor">Insert at cursor</button><button class="ai-btn ai-btn--muted" @click="replaceSelection">Replace selection</button><button class="ai-btn ai-btn--muted" @click="appendToDoc">Append to end</button><button class="ai-btn ai-btn--muted" @click="copyOutput">Copy</button></div></div>
    </div>
    <div v-else-if="activeTab==='templates'" class="ai-body">
      <div class="ai-template-list"><div v-for="tpl in templates" :key="tpl.id" class="ai-template-item" @click="useTemplate(tpl)"><span class="ai-template-item__icon">{{tpl.icon}}</span><div class="ai-template-item__text"><span class="ai-template-item__name">{{tpl.name}}</span><span class="ai-template-item__preview">{{tpl.prompt.slice(0,60)}}&#x2026;</span></div><button v-if="!tpl.isDefault" class="ai-template-item__del" @click.stop="deleteTemplate(tpl.id)" title="Delete">&times;</button></div></div>
      <button class="ai-btn ai-btn--muted ai-btn--block" @click="showNewTemplate=!showNewTemplate">{{showNewTemplate?'Cancel':'+ New template'}}</button>
      <div v-if="showNewTemplate" class="ai-template-editor"><div class="ai-field"><span class="ai-label">Name</span><input v-model="newTplName" class="ai-input" placeholder="My template"/></div><div class="ai-field"><span class="ai-label">Icon</span><input v-model="newTplIcon" class="ai-input ai-input--short" maxlength="2"/></div><div class="ai-field"><span class="ai-label">Prompt</span><textarea v-model="newTplPrompt" class="ai-textarea" rows="5" placeholder="Your reusable prompt&#x2026;"/></div><button class="ai-btn ai-btn--primary ai-btn--block" @click="handleSaveTemplate">Save template</button></div>
    </div>
    <div v-else-if="activeTab==='settings'" class="ai-body ai-settings">
      <div class="ai-settings-group"><span class="ai-label">Default provider</span><select v-model="aiSettings.defaultProvider.value" class="ai-select"><option value="mistral">Mistral</option><option value="openrouter">OpenRouter</option><option value="workers">Workers AI</option></select></div>
      <div class="ai-settings-group"><span class="ai-label">Mistral API</span><input type="password" v-model="aiSettings.mistralApiKey.value" class="ai-input" placeholder="API key" autocomplete="off"/><input type="text" v-model="aiSettings.mistralModel.value" class="ai-input ai-input--small" placeholder="mistral-large-latest"/><div class="ai-test-row"><button class="ai-btn ai-btn--muted" @click="handleTestConnection('mistral')" :disabled="testingProvider==='mistral'||!aiSettings.mistralApiKey.value"><template v-if="testingProvider==='mistral'">Testing&#x2026;</template><template v-else-if="testResult['mistral']==='success'"><strong>Connected</strong></template><template v-else-if="testResult['mistral']"><em>Failed</em></template><template v-else>Test connection</template></button></div><p v-if="testResult['mistral']&&testResult['mistral']!=='success'" class="ai-err-text">{{testResult['mistral']}}</p></div>
      <div class="ai-settings-group"><span class="ai-label">OpenRouter API</span><input type="password" v-model="aiSettings.openrouterApiKey.value" class="ai-input" placeholder="API key" autocomplete="off"/><input type="text" v-model="aiSettings.openrouterModel.value" class="ai-input ai-input--small" placeholder="openai/gpt-4o"/><div class="ai-test-row"><button class="ai-btn ai-btn--muted" @click="handleTestConnection('openrouter')" :disabled="testingProvider==='openrouter'||!aiSettings.openrouterApiKey.value"><template v-if="testingProvider==='openrouter'">Testing&#x2026;</template><template v-else-if="testResult['openrouter']==='success'"><strong>Connected</strong></template><template v-else-if="testResult['openrouter']"><em>Failed</em></template><template v-else>Test connection</template></button></div><p v-if="testResult['openrouter']&&testResult['openrouter']!=='success'" class="ai-err-text">{{testResult['openrouter']}}</p></div>
      <div class="ai-settings-group"><span class="ai-label">Cloudflare Workers AI</span><input type="url" v-model="aiSettings.workerUrl.value" class="ai-input" placeholder="https://your-worker.workers.dev"/><input type="password" v-model="aiSettings.workerApiKey.value" class="ai-input ai-input--small" placeholder="Auth key (optional)" autocomplete="off"/><input type="text" v-model="aiSettings.workerModel.value" class="ai-input ai-input--small" placeholder="@cf/meta/llama-3.1-8b-instruct"/><div class="ai-test-row"><button class="ai-btn ai-btn--muted" @click="handleTestConnection('workers')" :disabled="testingProvider==='workers'||!aiSettings.workerUrl.value"><template v-if="testingProvider==='workers'">Testing&#x2026;</template><template v-else-if="testResult['workers']==='success'"><strong>Connected</strong></template><template v-else-if="testResult['workers']"><em>Failed</em></template><template v-else>Test connection</template></button></div><p v-if="testResult['workers']&&testResult['workers']!=='success'" class="ai-err-text">{{testResult['workers']}}</p></div>
      <div class="ai-settings-group"><span class="ai-label">Default temperature &mdash; {{aiSettings.defaultTemperature.value.toFixed(1)}}</span><input type="range" min="0" max="1" step="0.1" v-model.number="aiSettings.defaultTemperature.value"/></div>
      <div class="ai-settings-group"><span class="ai-label">Default max tokens &mdash; {{aiSettings.defaultMaxTokens.value}}</span><input type="range" min="256" max="4096" step="256" v-model.number="aiSettings.defaultMaxTokens.value"/></div>
      <button class="ai-btn ai-btn--primary ai-btn--block" @click="handleSaveSettings">Save settings</button>
    </div>
    <div v-else-if="activeTab==='history'" class="ai-body">
      <p v-if="sessionHistory.length===0" class="ai-annotation" style="text-align:center;padding:2rem 0">No generations yet this session.</p>
      <div v-else class="ai-history-list"><div v-for="item in sessionHistory" :key="item.id" class="ai-history-card"><div class="ai-history-card__meta"><span>{{item.provider}}</span><span class="ai-annotation">{{item.time}}{{item.duration?' \u00b7 '+item.duration+'s':''}}</span></div><p class="ai-history-card__prompt">{{item.prompt.length>90?item.prompt.slice(0,90)+'\u2026':item.prompt}}</p><p class="ai-history-card__output">{{item.output.length>140?item.output.slice(0,140)+'\u2026':item.output}}</p><div class="ai-output-actions"><button class="ai-btn ai-btn--muted" @click="emit('insert-at-cursor',item.output)">Insert</button><button class="ai-btn ai-btn--muted" @click="emit('append-to-document',item.output)">Append</button><button class="ai-btn ai-btn--muted" @click="navigator.clipboard.writeText(item.output)">Copy</button></div></div></div>
    </div>
  </aside>
</template>

<style scoped>
.ai-panel{display:flex;flex-direction:column;height:100%;background:var(--bg-color);border-left:1px solid var(--border-color);position:relative;flex-shrink:0;font-size:12.5px;user-select:none;outline:none;font-family:'Inter',system-ui,-apple-system,sans-serif}
.ai-panel--resizing{cursor:col-resize}
.ai-panel__resize{position:absolute;left:-3px;top:0;width:6px;height:100%;cursor:col-resize;z-index:10}
.ai-panel__resize:hover{background:var(--accent-color);opacity:.3}
.ai-header{display:flex;align-items:baseline;padding:10px 14px 8px;border-bottom:1px solid var(--border-color);flex-shrink:0}
.ai-header__title{font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)}
.ai-header__spacer{flex:1}
.ai-header__btn{background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;padding:2px 5px;border-radius:2px;line-height:1;transition:color .15s}
.ai-header__btn:hover{color:var(--text-color)}.ai-header__btn.is-active{color:var(--text-color);font-weight:700}
.ai-providers{display:flex;border-bottom:1px solid var(--border-color);flex-shrink:0}
.ai-provider{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:7px 4px 6px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;color:var(--text-muted);font-family:inherit;font-size:10.5px;font-weight:500;transition:color .15s,border-color .15s}
.ai-provider:hover{color:var(--text-color)}.ai-provider.is-active{color:var(--text-color);font-weight:700;border-bottom-color:var(--text-color)}
.ai-provider__sub{font-size:9px;font-weight:400;opacity:.55}
.ai-tabs{display:flex;border-bottom:1px solid var(--border-color);flex-shrink:0}
.ai-tab{flex:1;padding:7px 0;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;font-family:inherit;font-size:10.5px;font-weight:500;letter-spacing:.02em;color:var(--text-muted);transition:color .15s,border-color .15s}
.ai-tab:hover{color:var(--text-color)}.ai-tab.is-active{color:var(--text-color);font-weight:700;border-bottom-color:var(--text-color)}
.ai-body{flex:1;overflow-y:auto;padding:14px 14px 22px;display:flex;flex-direction:column;gap:14px}
.ai-field{display:flex;flex-direction:column;gap:6px}
.ai-label{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);display:flex;align-items:center;justify-content:space-between}
.ai-kbd{font-family:monospace;font-size:9px;padding:1px 4px;border:1px solid var(--border-color);border-radius:2px;background:none;text-transform:none;letter-spacing:0;font-weight:400;color:var(--text-muted)}
.ai-annotation{font-size:10px;color:var(--text-muted);font-style:italic}
.ai-context-row{display:flex;gap:1px}
.ai-context-btn{flex:1;padding:5px 6px;border:none;border-bottom:1px solid var(--border-color);background:none;cursor:pointer;font-family:inherit;font-size:10.5px;color:var(--text-muted);text-align:center;transition:color .15s,border-color .15s,font-weight .15s}
.ai-context-btn:hover{color:var(--text-color)}.ai-context-btn.is-active{color:var(--text-color);font-weight:700;border-bottom-color:var(--text-color)}
.ai-quick-list{display:flex;flex-direction:column}
.ai-quick-item{display:flex;align-items:center;gap:8px;padding:6px 0;border:none;border-bottom:1px solid var(--border-color);background:none;cursor:pointer;font-family:inherit;font-size:11.5px;color:var(--text-color);text-align:left;transition:color .12s}
.ai-quick-item:last-child{border-bottom:none}.ai-quick-item:hover:not(:disabled){color:var(--accent-color)}.ai-quick-item:disabled{opacity:.35;cursor:not-allowed}
.ai-quick-item__icon{font-size:13px;flex-shrink:0;width:18px;text-align:center}.ai-quick-item__label{font-weight:450}
.ai-textarea{width:100%;padding:8px 0;border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);font-family:inherit;font-size:12px;line-height:1.6;resize:vertical;box-sizing:border-box;transition:border-color .2s;outline:none}
.ai-textarea:focus{border-bottom-color:var(--text-color)}.ai-textarea::placeholder{color:var(--text-muted);font-style:italic}
.ai-input{width:100%;padding:6px 0;border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);font-family:inherit;font-size:11.5px;box-sizing:border-box;transition:border-color .2s;outline:none;border-radius:0}
.ai-input:focus{border-bottom-color:var(--text-color)}.ai-input::placeholder{color:var(--text-muted);font-style:italic}
.ai-input--short{width:60px}.ai-input--small{font-size:11px}
.ai-select{width:100%;padding:6px 0;border:none;border-bottom:1px solid var(--border-color);background:transparent;color:var(--text-color);font-family:inherit;font-size:11.5px;cursor:pointer;outline:none;border-radius:0}
.ai-params{display:flex;gap:18px}
.ai-param{flex:1;display:flex;flex-direction:column;gap:3px}
.ai-param__label{font-size:10px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted)}
.ai-param__val{font-size:10px;font-weight:400;color:var(--text-muted);font-variant-numeric:tabular-nums}
.ai-param input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:2px;background:var(--border-color);border-radius:0;outline:none;cursor:pointer}
.ai-param input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:2px;background:var(--text-color);cursor:pointer}
.ai-actions{display:flex;gap:6px}.ai-output-actions{display:flex;gap:4px;flex-wrap:wrap}
.ai-btn{padding:6px 12px;border-radius:2px;border:1px solid var(--border-color);background:transparent;cursor:pointer;font-family:inherit;font-size:11px;font-weight:500;color:var(--text-color);transition:background .12s,border-color .12s;white-space:nowrap}
.ai-btn:hover:not(:disabled){background:var(--bg-secondary)}
.ai-btn--primary{flex:1;background:var(--text-color);color:var(--bg-color);border-color:var(--text-color);font-weight:600}
.ai-btn--primary:hover:not(:disabled){background:var(--text-color);opacity:.88}.ai-btn--primary:disabled{opacity:.3;cursor:not-allowed}
.ai-btn--stop{flex:1;border-color:var(--text-color);font-weight:600}
.ai-btn--muted{color:var(--text-muted);font-weight:400}.ai-btn--muted:hover{color:var(--text-color)}
.ai-btn--block{width:100%;text-align:center}
.ai-error{display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-color)}
.ai-error__msg{flex:1;margin:0;font-size:11px;line-height:1.5;color:var(--text-muted);font-style:italic}
.ai-err-text{margin:0;font-size:10px;color:var(--text-muted);font-style:italic;line-height:1.4;word-break:break-word}
.ai-output-section{display:flex;flex-direction:column;gap:8px}
.ai-output-meta{display:flex;align-items:center;gap:12px}
.ai-generating-indicator{font-size:10.5px;font-weight:500;font-style:italic;color:var(--text-muted);animation:ai-fade-pulse 1.4s ease-in-out infinite}
@keyframes ai-fade-pulse{0%,100%{opacity:.4}50%{opacity:1}}
.ai-output{max-height:260px;overflow-y:auto;padding:12px 0;border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color)}
.ai-output__text{margin:0;font-size:12px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--text-color);font-family:inherit}
.ai-template-list{display:flex;flex-direction:column}
.ai-template-item{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border-color);cursor:pointer;transition:color .12s}
.ai-template-item:last-child{border-bottom:none}.ai-template-item:hover{color:var(--accent-color)}
.ai-template-item__icon{font-size:15px;flex-shrink:0}
.ai-template-item__text{flex:1;display:flex;flex-direction:column;gap:2px;overflow:hidden}
.ai-template-item__name{font-size:12px;font-weight:600}
.ai-template-item__preview{font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:italic}
.ai-template-item__del{padding:3px 6px;border:none;background:none;cursor:pointer;color:var(--text-muted);font-size:14px;transition:color .12s}
.ai-template-item__del:hover{color:var(--text-color)}
.ai-template-editor{display:flex;flex-direction:column;gap:10px;padding:12px 0 0}
.ai-settings{gap:16px}.ai-settings-group{display:flex;flex-direction:column;gap:6px}.ai-test-row{margin-top:2px}
.ai-history-list{display:flex;flex-direction:column;gap:12px}
.ai-history-card{padding-bottom:10px;border-bottom:1px solid var(--border-color);display:flex;flex-direction:column;gap:5px}
.ai-history-card:last-child{border-bottom:none}
.ai-history-card__meta{display:flex;justify-content:space-between;font-size:10px;font-weight:500;text-transform:capitalize}
.ai-history-card__prompt{margin:0;font-size:11px;font-weight:600;color:var(--text-color);line-height:1.4}
.ai-history-card__output{margin:0;font-size:11px;color:var(--text-muted);line-height:1.4}
</style>
