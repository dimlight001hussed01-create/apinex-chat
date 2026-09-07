const express=require("express");
const multer=require("multer");
const cors=require("cors");
const fs=require("fs");
const path=require("path");
const AdmZip=require("adm-zip");
const mammoth=require("mammoth");
const XLSX=require("xlsx");
const pdfParse=require("pdf-parse");

const app=express();
const upload=multer({storage:multer.memoryStorage(),limits:{files:10,fileSize:15*1024*1024}});
app.use(cors());
app.use(express.static("."));

const PORT=process.env.PORT||3000;
const BASE=(process.env.APINEX_BASE_URL||"https://api.apinex.bond/v1").replace(/\/$/,"");
const APIKEY=process.env.APINEX_API_KEY;

function safeText(s,max=18000){return (s||"").slice(0,max)}
async function extractFile(f){
 const name=f.originalname, ext=path.extname(name).toLowerCase(), type=f.mimetype||"";
 if(type.startsWith("image/")) return {kind:"image",name,mime:type,b64:f.buffer.toString("base64")};
 if(ext===".pdf"){try{let p=await pdfParse(f.buffer);return {kind:"text",name,text:safeText(p.text)}}catch{}}
 if(ext===".docx"){try{let p=await mammoth.extractRawText({buffer:f.buffer});return {kind:"text",name,text:safeText(p.value)}}catch{}}
 if([".xlsx",".xls"].includes(ext)){try{let wb=XLSX.read(f.buffer);let out=wb.SheetNames.map(n=>`[${n}]\n`+XLSX.utils.sheet_to_csv(wb.Sheets[n])).join("\n");return {kind:"text",name,text:safeText(out)}}catch{}}
 if([".txt",".md",".csv",".json",".xml",".html",".js",".ts",".css",".py"].includes(ext)) return {kind:"text",name,text:safeText(f.buffer.toString("utf8"))};
 if([".zip",".7z"].includes(ext)){
   if(ext===".zip"){try{let z=new AdmZip(f.buffer),out=[];for(const e of z.getEntries()){if(!e.isDirectory&&e.entryName.length<180){let x=e.getData();if(/\.(txt|md|csv|json|xml|html|js|ts|css|py)$/i.test(e.entryName))out.push(`--- ${e.entryName} ---\n${safeText(x.toString("utf8"),5000)}`)}}return {kind:"text",name,text:safeText(out.join("\n"),18000)}}catch{}}
 }
 return {kind:"meta",name,text:`File received: ${name} (${type||"unknown"}, ${f.size} bytes). This file type was received but its internal contents were not extracted.`};
}
async function main(req,res){
 if(!APIKEY)return res.status(500).json({error:"APINEX_API_KEY সেট করা হয়নি"});
 const model=req.body.model, mode=req.body.mode||"messages", message=req.body.message||"";
 let old=[];try{old=JSON.parse(req.body.history||"[]")}catch{}
 const files=await Promise.all((req.files||[]).map(extractFile));
 let content=[{type:"text",text:message||"এই ফাইলগুলো বিশ্লেষণ করুন।"}];
 for(const f of files){
   if(f.kind==="image") content.push({type:"image_url",image_url:{url:`data:${f.mime};base64,${f.b64}`}});
   else content.push({type:"text",text:`\n[Attachment: ${f.name}]\n${f.text||""}`});
 }
 if(mode==="messages"){
   const messages=[];
   for(const h of old){if(h.role==="user"||h.role==="assistant")messages.push({role:h.role,content:h.text||""})}
   messages.push({role:"user",content});
   const r=await fetch(`${BASE}/messages`,{method:"POST",headers:{"x-api-key":APIKEY,"anthropic-version":"2023-06-01","Content-Type":"application/json"},body:JSON.stringify({model,max_tokens:4096,messages})});
   const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data?.error?.message||JSON.stringify(data)});
   const reply=(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("\n");
   return res.json({reply});
 }
 const messages=old.filter(h=>h.role==="user"||h.role==="assistant").map(h=>({role:h.role,content:h.text||""}));
 messages.push({role:"user",content});
 const r=await fetch(`${BASE}/chat/completions`,{method:"POST",headers:{"Authorization":`Bearer ${APIKEY}`,"Content-Type":"application/json"},body:JSON.stringify({model,messages,stream:false,temperature:.5,max_tokens:4096})});
 const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data?.error?.message||JSON.stringify(data)});
 res.json({reply:data?.choices?.[0]?.message?.content||""});
}
app.post("/api/chat",upload.array("files",10),(req,res)=>main(req,res).catch(e=>res.status(500).json({error:e.message})));
app.get("/health",(req,res)=>res.json({ok:true}));
app.listen(PORT,()=>console.log(`APInex Claude Chat running on ${PORT}`));