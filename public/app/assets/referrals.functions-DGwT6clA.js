async function e(){try{const r=await fetch("/api/v1/referrals",{credentials:"include"});return r.ok?await r.json():null}catch{return null}}export{e as g};
