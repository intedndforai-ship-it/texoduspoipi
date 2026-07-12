import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface ChatMessage { role: string; content: string }
export interface QuickAction { id: string; label: string; icon: string; prompt: string; needsContext: boolean }
export interface HistoryEntry { id: number; prompt: string; output: string; provider: string; time: string; duration?: string }

export const aiState = {
  selectedProvider: ref('mistral'), isGenerating: ref(false), streamedOutput: ref(''),
  error: ref<string | null>(null), conversationHistory: ref<ChatMessage[]>([]),
  temperature: ref(0.7), maxTokens: ref(2048), lastPrompt: ref(''),
  lastContext: ref<string | null>(null), generationStartTime: ref<number | null>(null),
  generationDuration: ref<string | null>(null),
}

export const aiSettings = {
  mistralApiKey: ref(''), mistralModel: ref('mistral-large-latest'),
  openrouterApiKey: ref(''), openrouterModel: ref('openai/gpt-4o'),
  workerUrl: ref(''), workerApiKey: ref(''), workerModel: ref('@cf/meta/llama-3.1-8b-instruct'),
  defaultProvider: ref('mistral'), defaultTemperature: ref(0.7), defaultMaxTokens: ref(2048),
}

let _ul: (() => void) | null = null

export function getActiveProviderConfig() {
  const p = aiState.selectedProvider.value
  if (p === 'mistral') return {id:'mistral',label:'Mistral',sub:'Mistral AI',baseUrl:'https://api.mistral.ai/v1',model:aiSettings.mistralModel.value}
  if (p === 'openrouter') return {id:'openrouter',label:'OpenRouter',sub:'Any Model',baseUrl:'https://openrouter.ai/api/v1',model:aiSettings.openrouterModel.value}
  return {id:'workers',label:'Workers AI',sub:'Cloudflare',baseUrl:aiSettings.workerUrl.value,model:aiSettings.workerModel.value}
}

export async function loadAISettings() {
  try {
    const { Store } = await import('@tauri-apps/plugin-store'); const store = await Store.load('ai-settings.json')
    const get = async (k:string,f:string) => { try{return (await store.get(k))??f}catch{return f} }
    const getN = async (k:string,f:number) => { try{return (await store.get(k))??f}catch{return f} }
    aiSettings.mistralApiKey.value = await get('mistralApiKey','')
    aiSettings.mistralModel.value = await get('mistralModel','mistral-large-latest')
    aiSettings.openrouterApiKey.value = await get('openrouterApiKey','')
    aiSettings.openrouterModel.value = await get('openrouterModel','openai/gpt-4o')
    aiSettings.workerUrl.value = await get('workerUrl','')
    aiSettings.workerApiKey.value = await get('workerApiKey','')
    aiSettings.workerModel.value = await get('workerModel','@cf/meta/llama-3.1-8b-instruct')
    aiSettings.defaultProvider.value = await get('defaultProvider','mistral')
    aiSettings.defaultTemperature.value = await getN('defaultTemperature',0.7)
    aiSettings.defaultMaxTokens.value = await getN('defaultMaxTokens',2048)
    aiState.selectedProvider.value = aiSettings.defaultProvider.value
    aiState.temperature.value = aiSettings.defaultTemperature.value
    aiState.maxTokens.value = aiSettings.defaultMaxTokens.value
  } catch(e) { console.warn('[AI] load failed:',e) }
}

export async function saveAISettings() {
  const { Store } = await import('@tauri-apps/plugin-store'); const store = await Store.load('ai-settings.json')
  const entries: [string,any][] = [
    ['mistralApiKey',aiSettings.mistralApiKey.value],['mistralModel',aiSettings.mistralModel.value],
    ['openrouterApiKey',aiSettings.openrouterApiKey.value],['openrouterModel',aiSettings.openrouterModel.value],
    ['workerUrl',aiSettings.workerUrl.value],['workerApiKey',aiSettings.workerApiKey.value],
    ['workerModel',aiSettings.workerModel.value],['defaultProvider',aiSettings.defaultProvider.value],
    ['defaultTemperature',aiSettings.defaultTemperature.value],['defaultMaxTokens',aiSettings.defaultMaxTokens.value],
  ]
  for (const [k,v] of entries) await store.set(k,v)
  await store.save()
}

export async function generateAI(userPrompt:string, context:string|null=null, onChunk:((c:string)=>void)|null=null) {
  if (aiState.isGenerating.value) return
  aiState.isGenerating.value=true; aiState.streamedOutput.value=''; aiState.error.value=null
  aiState.generationDuration.value=null; aiState.lastPrompt.value=userPrompt; aiState.lastContext.value=context
  aiState.generationStartTime.value=Date.now()
  const prov = getActiveProviderConfig()
  const msgs: ChatMessage[] = [{role:'system',content:'You are a writing assistant inside Texodus, a Markdown editor. Always respond in GitHub Flavored Markdown. Be precise, helpful, match professional writing quality. No meta-commentary.'}]
  msgs.push(...aiState.conversationHistory.value.slice(-6))
  let fp = userPrompt; if (context) fp = '**Context:**\n```\n'+context+'\n```\n\n**Task:** '+userPrompt
  msgs.push({role:'user',content:fp})
  if (_ul) { await _ul(); _ul=null }
  _ul = await listen<{type:string;content?:string}>('ai-stream-chunk',(e)=>{if(e.payload.type==='chunk'&&e.payload.content){aiState.streamedOutput.value+=e.payload.content;onChunk?.(e.payload.content)}})
  try {
    const ak = prov.id==='mistral'?aiSettings.mistralApiKey.value:prov.id==='openrouter'?aiSettings.openrouterApiKey.value:aiSettings.workerApiKey.value
    const eh = prov.id==='openrouter'?[['HTTP-Referer','https://texodus.app'],['X-Title','Texodus']]:[]
    const r = await invoke<string>('ai_generate',{baseUrl:prov.baseUrl,apiKey:ak,model:prov.model,messages:msgs,temperature:aiState.temperature.value,maxTokens:aiState.maxTokens.value,extraHeaders:eh})
    const fo = r||aiState.streamedOutput.value
    aiState.conversationHistory.value.push({role:'user',content:fp},{role:'assistant',content:fo})
    if (aiState.conversationHistory.value.length>20) aiState.conversationHistory.value=aiState.conversationHistory.value.slice(-20)
    aiState.generationDuration.value = ((Date.now()-(aiState.generationStartTime.value??Date.now()))/1000).toFixed(1)
    return fo
  } catch(err) { aiState.error.value=String(err).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]'); throw err }
  finally { aiState.isGenerating.value=false; if(_ul){await _ul();_ul=null} }
}

export async function retryLastGeneration(onChunk:((c:string)=>void)|null=null) { if(!aiState.lastPrompt.value)return; return generateAI(aiState.lastPrompt.value,aiState.lastContext.value,onChunk) }
export function clearConversation() { aiState.conversationHistory.value=[];aiState.streamedOutput.value='';aiState.error.value=null;aiState.generationDuration.value=null;aiState.lastPrompt.value='';aiState.lastContext.value=null }

export async function testConnection(pid:string):Promise<string> {
  const c = pid==='mistral'?{baseUrl:'https://api.mistral.ai/v1',apiKey:aiSettings.mistralApiKey.value,model:aiSettings.mistralModel.value}:pid==='openrouter'?{baseUrl:'https://openrouter.ai/api/v1',apiKey:aiSettings.openrouterApiKey.value,model:aiSettings.openrouterModel.value}:{baseUrl:aiSettings.workerUrl.value,apiKey:aiSettings.workerApiKey.value,model:aiSettings.workerModel.value}
  return invoke<string>('ai_probe_endpoint',{baseUrl:c.baseUrl,apiKey:c.apiKey,model:c.model})
}

export const QUICK_ACTIONS: QuickAction[] = [
  {id:'improve',label:'Improve Writing',icon:'\u2728',prompt:'Improve the writing quality of the following text. Make it clearer, more engaging, and more polished while preserving the original meaning and voice. Output only the improved text:',needsContext:true},
  {id:'shorter',label:'Make Shorter',icon:'\u2702\ufe0f',prompt:'Make the following text more concise. Remove all redundancy and filler while keeping every important idea. Output only the shortened version:',needsContext:true},
  {id:'longer',label:'Expand',icon:'\ud83d\udcdd',prompt:'Expand and elaborate on the following text. Add relevant depth, examples, and detail. Match the existing tone and style. Output only the expanded text:',needsContext:true},
  {id:'grammar',label:'Fix Grammar',icon:'\ud83d\udd24',prompt:'Fix all grammar, spelling, and punctuation errors in the following text. Make no other changes \u2014 do not rephrase, only correct errors. Output the corrected text only:',needsContext:true},
  {id:'summarize',label:'Summarize',icon:'\ud83d\udccb',prompt:'Write a concise summary of the following text as 3\u20135 Markdown bullet points. Capture only the core ideas:',needsContext:true},
  {id:'outline',label:'Generate Outline',icon:'\ud83d\uddc2\ufe0f',prompt:'Generate a detailed Markdown document outline for the following topic. Use nested headings (##, ###) and brief descriptions for each section:',needsContext:false},
  {id:'professional',label:'Make Professional',icon:'\ud83d\udcbc',prompt:'Rewrite the following text in a professional, formal tone suitable for business communication. Output only the rewritten text:',needsContext:true},
  {id:'casual',label:'Make Casual',icon:'\ud83d\ude0a',prompt:'Rewrite the following text in a casual, friendly, conversational tone. Keep it natural and approachable. Output only the rewritten text:',needsContext:true},
  {id:'continue',label:'Continue Writing',icon:'\u25b6\ufe0f',prompt:'Continue writing from where the following text ends. Match the style, tone, voice, and format exactly. Write at least 3 more paragraphs:',needsContext:true},
  {id:'translate',label:'Translate to English',icon:'\ud83c\udf10',prompt:'Translate the following text to English. Preserve the meaning, tone, and formatting as closely as possible:',needsContext:true},
];
