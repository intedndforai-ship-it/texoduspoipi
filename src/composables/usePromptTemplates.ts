import { ref } from 'vue'
export interface PromptTemplate { id: string; name: string; icon: string; prompt: string; isDefault: boolean }
const D: PromptTemplate[] = [
  {id:'blog-post',name:'Blog Post',icon:'📖',isDefault:true,prompt:'Write a comprehensive blog post about the following topic.\nInclude:\n- An engaging headline and hook introduction\n- 3\u20134 body sections with ## subheadings\n- Practical examples or evidence in each section\n- A strong conclusion with a clear takeaway\n\nUse a confident, conversational tone. Output in Markdown.\n\nTopic: [TOPIC]'},
  {id:'tech-doc',name:'Technical Doc',icon:'⚙️',isDefault:true,prompt:'Write technical documentation for the following subject.\nInclude:\n- ## Overview\n- ## Requirements / Prerequisites\n- ## Step-by-step Instructions (numbered)\n- ## Code Examples (with fenced code blocks)\n- ## Troubleshooting\n\nSubject: [SUBJECT]'},
  {id:'readme',name:'README',icon:'📄',isDefault:true,prompt:'Write a professional GitHub README for the following project.\nSections:\n- Title with badge placeholders\n- Short description tagline\n- ## Features (bulleted)\n- ## Installation\n- ## Usage (with code examples)\n- ## Configuration\n- ## Contributing\n- ## License\n\nProject: [PROJECT DESCRIPTION]'},
  {id:'meeting-notes',name:'Meeting Notes',icon:'📅',isDefault:true,prompt:'Format the following raw notes into clean, structured Markdown meeting notes.\nSections:\n- **Date:** [date]\n- **Attendees:** [names]\n- ## Agenda\n- ## Discussion Points\n- ## Decisions Made\n- ## Action Items (with owner and deadline)\n\nRaw notes: [RAW NOTES]'},
  {id:'email',name:'Email Draft',icon:'✉️',isDefault:true,prompt:'Draft a professional email for the following purpose.\nProvide:\n1. A suggested subject line\n2. The full email body with appropriate greeting and sign-off\n3. A brief note on tone/strategy used\n\nPurpose: [PURPOSE]'},
  {id:'social-post',name:'Social Post',icon:'📱',isDefault:true,prompt:'Write 3 variations of a social media post about the following topic.\nRequirements:\n- Each under 280 characters\n- Engaging, non-spammy tone\n- Include 2\u20133 relevant hashtags per post\n- Label them Variation A, B, C\n\nTopic: [TOPIC]'},
]
const K='texodus-ai-templates-v1'; const T=ref<PromptTemplate[]>([...D])
export function usePromptTemplates() {
  function load() { try { const r=localStorage.getItem(K); if(r){ const c=JSON.parse(r) as PromptTemplate[]; T.value=[...D,...c.filter(t=>!t.isDefault)] } } catch{} }
  function persist() { localStorage.setItem(K,JSON.stringify(T.value.filter(t=>!t.isDefault))) }
  function add(name:string,icon:string,prompt:string): PromptTemplate { if(!name.trim()||!prompt.trim()) throw Error('Required'); const t:PromptTemplate={id:'custom-'+Date.now(),name:name.trim(),icon:icon||'📌',prompt:prompt.trim(),isDefault:false}; T.value=[...T.value,t]; persist(); return t }
  function del(id:string) { const t=T.value.find(x=>x.id===id); if(!t||t.isDefault) return; T.value=T.value.filter(x=>x.id!==id); persist() }
  return { templates:T, loadTemplates:load, addTemplate:add, deleteTemplate:del }
}
