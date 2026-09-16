import os
html=open("supabase/functions/app/index.html",encoding="utf-8").read()
core="globalThis.Deno=globalThis.Deno||{env:{get:()=>undefined}};\n"+open("demo/core.js",encoding="utf-8").read()
adapter=open("demo/adapter.js",encoding="utf-8").read()
demo=html.replace("<script>\n/*BRAND*/","<script>\n"+core+"\n</script>\n<script>\nwindow.BRAND={name:'Utility',supplier:'Supplier S.A.',support:'',eid:'e-ID Wallet',grid:'the grid operator',taxIdLabel:'Tax ID',locale:'el'};",1)
i=demo.rfind("render();"); demo=demo[:i]+adapter+"\nrender();"+demo[i+len("render();"):]
os.makedirs("dist",exist_ok=True); open("dist/econtract-demo.html","w",encoding="utf-8").write(demo); print("dist/econtract-demo.html",len(demo))
