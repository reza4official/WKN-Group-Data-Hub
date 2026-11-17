const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1'
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url')
const fake=(email,sub)=>`${b64({alg:'none',typ:'JWT'})}.${b64({sub,email,email_verified:true,iss:'https://accounts.google.com',aud:'x'})}.`
const post=(u,b,h={})=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)})
async function googleSignIn(email,sub){
  const r=await post(`${AUTH}/accounts:signInWithIdp?key=fake`,{postBody:`id_token=${fake(email,sub)}&providerId=google.com`,requestUri:'http://localhost',returnIdToken:true,returnSecureToken:true})
  return r.json()
}
const link=(idToken)=>fetch('http://127.0.0.1:8787/auth/google-link',{method:'POST',headers:{Authorization:`Bearer ${idToken}`,Origin:'http://127.0.0.1:4173'}})
const lookup=async(localId)=>{const r=await post(`${AUTH}/projects/demo-wkn/accounts:lookup`,{localId:[localId]},{Authorization:'Bearer owner'});return r.json()}

// 1) email terdaftar (Reza4Official@Gmail.com disimpan huruf kecil)
let g=await googleSignIn('Reza4Official@Gmail.com','g-sub-1'); console.log('provider google, stray uid:',g.localId)
let r=await link(g.idToken); let j=await r.json(); console.log('link terdaftar ->',r.status, j.customToken?'customToken ada':j)
const ct=await post(`${AUTH}/accounts:signInWithCustomToken?key=fake`,{token:j.customToken,returnSecureToken:true}).then(x=>x.json())
console.log('uid setelah custom token:',ct.localId,'| berbeda dari stray:',ct.localId!==g.localId)
console.log('akun sementara terhapus:',!(await lookup(g.localId)).users)
// 2) email tidak terdaftar
g=await googleSignIn('asing@gmail.com','g-sub-2'); r=await link(g.idToken); j=await r.json()
console.log('link tak terdaftar ->',r.status,j.error,'| akun sementara terhapus:',!(await lookup(g.localId)).users)
// 3) token username/password tidak boleh dipakai di endpoint ini dan akun tidak terhapus
const pw=await post(`${AUTH}/accounts:signInWithPassword?key=fake`,{email:process.argv[2],password:'rahasia123',returnSecureToken:true}).then(x=>x.json())
r=await link(pw.idToken); j=await r.json(); console.log('token password ->',r.status,j.error,'| akun asli masih ada:',!!(await lookup(pw.localId)).users)
