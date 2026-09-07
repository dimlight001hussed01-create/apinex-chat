const express=require("express"),multer=require("multer"),cors=require("cors"),fs=require("fs");
const app=express(),upload=multer({dest:"uploads/"});
app.use(cors());app.use(express.static("."));
const PORT=process.env.PORT||3000, API=process.env.APINEX_URL||"https://api.apinex.bond/v1/chat/completions";
app.post("/api/chat",upload.array("files",10),async(req,res)=>{
 try{
  const key=process.env.APINEX_API_KEY;if(!key)return res.status(500).json({error:"APINEX_API_KEY সেট করা হয়নি"});
  const history=JSON.parse(req.body.history||"[]"); const text=req.body.message||"";
  // Text chat + file metadata. Images are sent as data URLs when possible.
  const content=[{type:"text",text:text||"এই ফাইলগুলো দেখুন।"}];
  for(const f of (req.files||[])){
   if((f.mimetype||"").startsWith("image/")){
    const b=fs.readFileSync(f.path).toString("base64");
    content.push({type:"image_url",image_url:{url:`data:${f.mimetype};base64,${b}`}});
   } else content.push({type:"text",text:`Attached file: ${f.originalname} (${f.mimetype}, ${f.size} bytes)`});
  }
  const messages=[...history,{role:"user",content}];
  const r=await fetch(API,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.APINEX_MODEL||"gpt/5.6-luna",messages,stream:false})});
  const data=await r.json(); if(!r.ok)return res.status(r.status).json({error:data?.error?.message||JSON.stringify(data)});
  res.json({reply:data?.choices?.[0]?.message?.content||""});
 }catch(e){res.status(500).json({error:e.message})}
});
app.listen(PORT,()=>console.log("APInex Chat running on "+PORT));