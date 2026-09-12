const CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
});

function cors(env, request) {
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGIN || '';
  const headers = { ...CORS_HEADERS, Vary: 'Origin' };
  if (allowed === '*' || origin === allowed) {
    headers['Access-Control-Allow-Origin'] = origin || allowed || '*';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function response(data, status, env, request, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(env, request), ...extra },
  });
}

const internalEmail = (username) => `${username.toLowerCase()}@letter-rng.internal`;
const usernameRe = /^[A-Za-z0-9_ -]{3,20}$/;

async function sb(env, path, options = {}) {
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { res, data };
}

async function authUser(env, token) {
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!r.ok) return null;
  return r.json();
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  for (const part of cookies.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

const sessionCookie = (token, maxAge = 60 * 60 * 24 * 30) =>
  `lr_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`;

const clearCookie = 'lr_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None';

async function currentSession(env, request) {
  const token = getCookie(request, 'lr_session');
  if (!token) return null;
  const user = await authUser(env, token);
  if (!user) return null;
  const profile = await getProfile(env, user.id);
  return { token, user, profile };
}

async function getProfile(env, userId) {
  const q = encodeURIComponent(userId);
  const r = await sb(env, `/rest/v1/profiles?id=eq.${q}&select=*`);
  return r.data?.[0] || null;
}

async function getBadgesForUser(env, userId) {
  const q = encodeURIComponent(userId);
  const r = await sb(env, `/rest/v1/user_badges?user_id=eq.${q}&select=badge_id,unlocked_at&order=unlocked_at.asc`);
  return r.data || [];
}

async function getHistoryForUser(env, userId) {
  const q = encodeURIComponent(userId);
  const r = await sb(env, `/rest/v1/rolls?user_id=eq.${q}&select=id,letters,roll_rarity,points,mutations,badges,created_at&order=created_at.desc&limit=100`);
  return r.data || [];
}

async function findProfileByUsername(env, username) {
  const q = encodeURIComponent(username);
  return sb(env, `/rest/v1/profiles?username=eq.${q}&select=*`);
}

async function updateProfile(env, userId, patch) {
  const q = encodeURIComponent(userId);
  return sb(env, `/rest/v1/profiles?id=eq.${q}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

// ---------------- WORD DATA ----------------
const TWO = new Set('am an as at be by do go he if in is it me my no of oh on or so to up us we ax ex ox'.split(' '));
const THREE = new Set('ace act add age air all and ant any ape arm art ate bad bag ban bar bat bed bee bet big bit box boy bud bus buy can car cat cow cry cup cut day did dog dot dry ear eat egg end eye far fat few fig fin fit fox fun get god got hat hen her him his hot how ice ink jam jar job joy key kid leg let lie lip log lot low man map may men mix mom mud net new nod not now nut oak off oil old one out owl own pan pay pen pet pie pig pin pop pot red run sad sea see set she sit six sky son sun tap tea ten the tie tin top toy try two use van war way web wet win won yes you zoo'.split(' '));
const FOUR = new Set('able acid also area away baby back ball bank base bear beat best blue boat book cake call calm came camp card care city club cold come cool door down draw drop each easy edge else even ever face fact fair fall farm fast fear feel file fill find fire fish five food foot free from game gave girl give glad gold good hand hard head help here high home hope idea into jump just keep kind king knew know lake land last late lead life like line list long look made make many mark mean meet mile mind more most move name near need next nice open over page pair part path play race read real road room same save ship shop show side snow some song soon star stay step stop take talk team tell than that them then they this time tiny tree true turn used very walk wall want warm wave well went were what when will wind wish with word work year your'.split(' '));
const FIVE = new Set('about after again apple beach black brain bread bring brown build chair class clean clear clock close cloud dance dream earth early every field first floor found front fruit great green group house human light maybe money music never night ocean other paper plant point power quick right river round school short sleep small smile space sport stand start stone story thing three throw today water white whole world write young'.split(' '));
const SIX = new Set('almost animal banana basket battle better button castle cherry circle coffee cookie dragon dreams friend garden hammer jungle kitten letter little london mango market mirror monkey mother orange people planet player purple rabbit random rocket school secret silver simple soccer summer tetris turtle winter wizard'.split(' '));
const VOWELS = new Set(['A','E','I','O','U']);

const BADGES = {
  twoletterword: ['TWO LETTER WORD','common',15], threeletterword:['THREE LETTER WORD','uncommon',40],
  fourletterword:['FOUR LETTER WORD','rare',120], fiveletterword:['FIVE LETTER WORD','epic',400], sixletterword:['SIX LETTER WORD','legendary',1500],
  doubleword:['DOUBLE WORD','rare',200], wordmirror:['WORD MIRROR','epic',700], wordchain:['WORD CHAIN','legendary',2200],
  vowelpair:['VOWEL PAIR','uncommon',25], consonantrun:['CONSONANT RUN','rare',80],
  uncommonmutation:['UNCOMMON MUTATION','uncommon',35], raremutation:['RARE MUTATION','rare',90], neonmutation:['NEON MUTATION','rare',125],
  epicmutation:['EPIC MUTATION','epic',500], mythicmutation:['MYTHIC MUTATION','mythic',5000], rainbowmutation:['RAINBOW MUTATION','rainbow',25000],
  catastrophicmutation:['CATASTROPHIC MUTATION','catastrophic',1000000], doublemutation:['DOUBLE MUTATION','epic',750], mutationrain:['MUTATION RAIN','legendary',2500],
};

function rollMutation() {
  const r = Math.random();
  if (r < 0.000005) return 'catastrophic';
  if (r < 0.000205) return 'rainbow';
  if (r < 0.002205) return 'mythic';
  if (r < 0.010205) return 'epic';
  if (r < 0.030205) return 'neon';
  if (r < 0.080205) return 'rare';
  if (r < 0.230205) return 'uncommon';
  return 'normal';
}

function findWords(s) {
  const low = s.toLowerCase(), found = [];
  const sets = [[TWO,2],[THREE,3],[FOUR,4],[FIVE,5],[SIX,6]];
  for (let i=0;i<low.length;i++) for (const [set,len] of sets) {
    if (i+len <= low.length) { const word=low.slice(i,i+len); if(set.has(word)) found.push({word,start:i,len}); }
  }
  return found;
}

function checkPatterns(s) {
  const len=s.length, c={}; for(const ch of s)c[ch]=(c[ch]||0)+1;
  const vals=Object.values(c), ids=[];
  const words=findWords(s);
  if(words.some(w=>w.len===2))ids.push('twoletterword');
  if(words.some(w=>w.len===3))ids.push('threeletterword');
  if(words.some(w=>w.len===4))ids.push('fourletterword');
  if(words.some(w=>w.len===5))ids.push('fiveletterword');
  if(words.some(w=>w.len===6))ids.push('sixletterword');
  if(words.length>=2)ids.push('doubleword');
  if(words.some((a,i)=>words.some((b,j)=>j>i && a.start!==b.start && a.word===b.word.split('').reverse().join(''))))ids.push('wordmirror');
  if(new Set(words.map(w=>w.start)).size>=2)ids.push('wordchain');
  if(/^[A-Z]*[AEIOU]{2}/.test(s)||/[AEIOU]{2}/.test(s))ids.push('vowelpair');
  if(/[B-DF-HJ-NP-TV-Z]{4,}/.test(s))ids.push('consonantrun');
  if(new Set(s).size===len)ids.push('unique');
  if(len>=2 && s[0]===s[len-1])ids.push('firstlast');
  if(vals.filter(v=>v===2).length>=2)ids.push('doublepair');
  if(s===s.split('').reverse().join(''))ids.push('pal');
  if(len===6 && s.slice(0,3)===s.slice(3).split('').reverse().join(''))ids.push('mirror');
  let asc=len>=2, desc=len>=2; for(let i=1;i<len;i++){if(s.charCodeAt(i)!==s.charCodeAt(i-1)+1)asc=false;if(s.charCodeAt(i)!==s.charCodeAt(i-1)-1)desc=false;}
  if(asc)ids.push('alphabet'); if(desc)ids.push('reversealpha');
  if(len>=2 && new Set([s[0],s[1]]).size===2 && [...s].every((x,i)=>x===s[i%2]))ids.push('alternating');
  if(vals.includes(6))ids.push('same'); if(vals.includes(5))ids.push('five'); if(vals.includes(4))ids.push('four'); if(vals.includes(3))ids.push('triple'); if(vals.includes(2))ids.push('double');
  if([...s].filter(x=>VOWELS.has(x)).length>=4)ids.push('vowels'); if([...s].every(x=>!VOWELS.has(x)))ids.push('novowels');
  return [...new Set(ids)];
}

const RARITIES=[
 {id:'catastrophic',name:'CATASTROPHIC',band:'Top 0.1%',min:100000},
 {id:'rainbow',name:'RAINBOW',band:'Top 0.1%–3%',min:15000},
 {id:'mythic',name:'MYTHIC',band:'Top 3%',min:2000},
 {id:'legendary',name:'LEGENDARY',band:'Top 10%',min:600},
 {id:'epic',name:'EPIC',band:'Top 20%',min:180},
 {id:'rare',name:'RARE',band:'Top 40%',min:60},
 {id:'uncommon',name:'UNCOMMON',band:'20%–40%',min:20},
 {id:'common',name:'COMMON',band:'Bottom 20%',min:0},
];
function rarity(points, ids) {
  const wordIds=new Set(['twoletterword','threeletterword','fourletterword','fiveletterword','sixletterword','doubleword','wordmirror','wordchain','vowelpair','consonantrun']);
  let score=points; for(const id of ids)if(wordIds.has(id))score+=75;
  if(ids.includes('catastrophicmutation'))score=Math.max(score,1000000);
  else if(ids.includes('rainbowmutation'))score=Math.max(score,25000);
  return RARITIES.find(r=>score>=r.min) || RARITIES.at(-1);
}

function mutationBadgeIds(muts){
  const ids=[]; const types=new Set(muts);
  if(types.has('uncommon'))ids.push('uncommonmutation'); if(types.has('rare'))ids.push('raremutation'); if(types.has('neon'))ids.push('neonmutation');
  if(types.has('epic'))ids.push('epicmutation'); if(types.has('mythic'))ids.push('mythicmutation'); if(types.has('rainbow'))ids.push('rainbowmutation'); if(types.has('catastrophic'))ids.push('catastrophicmutation');
  const n=muts.filter(x=>x!=='normal').length; if(n>=2)ids.push('doublemutation'); if(n>=3)ids.push('mutationrain'); return ids;
}

function pointsFor(ids){return ids.reduce((n,id)=>n+(BADGES[id]?.[2]||0),0);}

function performRoll(){
  const r=Math.random(); let len; if(r<.01)len=1; else if(r<.04)len=2; else if(r<.10)len=3; else if(r<.19)len=4; else if(r<.35)len=5; else len=6;
  const letters=[], mutations=[];
  for(let i=0;i<len;i++){letters.push(String.fromCharCode(65+Math.floor(Math.random()*26))); mutations.push(rollMutation());}
  const formation=letters.join(''), ids=[...checkPatterns(formation),...mutationBadgeIds(mutations)];
  const unique=[...new Set(ids)], points=pointsFor(unique), rr=rarity(points,unique);
  return {letters,formation,mutations, badges:unique,points,rollRarity:rr.id,rollRarityBand:rr.band};
}

async function createAuthUser(env, username, password){
  return sb(env,'/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:internalEmail(username),password,email_confirm:true,user_metadata:{username}})});
}
async function loginAuthUser(env, username, password){
  return sb(env,'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:internalEmail(username),password})});
}

async function register(env, request){
  const b=await request.json(); const username=String(b.username||'').trim(),password=String(b.password||'');
  if(!usernameRe.test(username))return response({error:'Username must be 3-20 characters.'},400,env,request);
  if(password.length<4)return response({error:'Password must be at least 4 characters.'},400,env,request);
  const existing=await findProfileByUsername(env,username);
  if(existing.data?.length)return response({error:'That username is already taken.'},409,env,request);
  const made=await createAuthUser(env,username,password);
  if(!made.res.ok)return response({error:made.data?.msg||'Unable to create account.'},400,env,request);
  const user=made.data.user;
  // Trigger creates profile. Ensure it exists before returning.
  let profile=await getProfile(env,user.id);
  if(!profile){
    const p=await sb(env,'/rest/v1/profiles',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id:user.id,username})});
    profile=p.data?.[0]||null;
  }
  const logged=await loginAuthUser(env,username,password);
  if(!logged.res.ok)return response({error:'Account created. Please log in.'},201,env,request);
  const badges=await getBadgesForUser(env,user.id);
  const history=await getHistoryForUser(env,user.id);
  return response({user:{id:user.id,username},profile, badges, history, session:{expires_at:logged.data.expires_at}},200,env,request,{'Set-Cookie':sessionCookie(logged.data.access_token)});
}

async function login(env, request){
  const b=await request.json(); const username=String(b.username||'').trim(),password=String(b.password||'');
  if(!usernameRe.test(username)||!password)return response({error:'Incorrect username or password.'},401,env,request);
  const logged=await loginAuthUser(env,username,password);
  if(!logged.res.ok)return response({error:'Incorrect username or password.'},401,env,request);
  const user=logged.data.user, profile=await getProfile(env,user.id);
  const badges=await getBadgesForUser(env,user.id);
  const history=await getHistoryForUser(env,user.id);
  return response({user:{id:user.id,username:profile?.username||username},profile,badges,history,session:{expires_at:logged.data.expires_at}},200,env,request,{'Set-Cookie':sessionCookie(logged.data.access_token)});
}

async function handleRoll(env, request){
  const session=await currentSession(env,request); if(!session?.profile)return response({error:'Not authenticated.'},401,env,request);
  const roll=performRoll();
  const existingBadgeRows=(await sb(env,`/rest/v1/user_badges?user_id=eq.${encodeURIComponent(session.user.id)}&select=badge_id`)).data||[];
  const existingBadges=new Set(existingBadgeRows.map(x=>x.badge_id));
  const newBadges=roll.badges.filter(id=>!existingBadges.has(id));
  const newPoints=roll.points;
  const oldPoints=Number(session.profile.points||0), newTotal=oldPoints+newPoints;
  const oldBest=Number(session.profile.best_roll_points||0);
  const bestPatch=newPoints>oldBest?{best_roll:roll.formation,best_roll_points:newPoints,best_roll_rarity:roll.rollRarity}:{};
  const profilePatch={points:newTotal,rolls:Number(session.profile.rolls||0)+1,...bestPatch};
  const pr=await updateProfile(env,session.user.id,profilePatch);
  if(!pr.res.ok)return response({error:'Could not save roll.'},500,env,request);
  const badgesArray=roll.badges;
  const rr=await sb(env,'/rest/v1/rolls',{method:'POST',body:JSON.stringify({user_id:session.user.id,letters:roll.formation,roll_rarity:roll.rollRarity,points:roll.points,mutations:roll.mutations,badges:badgesArray})});
  if(!rr.res.ok)return response({error:'Could not save roll history.'},500,env,request);
  if(newBadges.length){
    const rows=newBadges.map(badge_id=>({user_id:session.user.id,badge_id}));
    await sb(env,'/rest/v1/user_badges',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify(rows)});
  }
  return response({...roll,newBadges,totalPoints:newTotal,totalRolls:profilePatch.rolls,bestRoll:newPoints>oldBest},200,env,request);
}

async function publicPlayers(env,request){
  const r=await sb(env,'/rest/v1/profiles?select=id,username,bio,points,rolls,best_roll,best_roll_points,best_roll_rarity,created_at&order=points.desc&limit=100');
  return response({players:r.data||[]},200,env,request);
}

async function publicProfile(env,request,username){
  const r=await findProfileByUsername(env,username); const p=r.data?.[0]; if(!p)return response({error:'Player not found.'},404,env,request);
  const u=await sb(env,`/rest/v1/user_badges?user_id=eq.${encodeURIComponent(p.id)}&select=badge_id,unlocked_at&order=unlocked_at.asc`);
  return response({profile:{...p,badges:u.data||[]}},200,env,request);
}

export default { async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(env,request)});
  try {
    if(url.pathname==='/api/auth/register'&&request.method==='POST')return await register(env,request);
    if(url.pathname==='/api/auth/login'&&request.method==='POST')return await login(env,request);
    if(url.pathname==='/api/auth/logout'&&request.method==='POST')return response({ok:true},200,env,request,{'Set-Cookie':clearCookie});
    if(url.pathname==='/api/auth/me'&&request.method==='GET'){
      const s=await currentSession(env,request); if(!s?.profile)return response({error:'Not authenticated.'},401,env,request);
      const badges=await getBadgesForUser(env,s.user.id);
      const history=await getHistoryForUser(env,s.user.id);
      return response({user:{id:s.user.id,username:s.profile.username},profile:s.profile,badges,history},200,env,request);
    }
    if(url.pathname==='/api/roll'&&request.method==='POST')return await handleRoll(env,request);
    if(url.pathname==='/api/history'&&request.method==='GET'){
      const s=await currentSession(env,request);if(!s?.profile)return response({error:'Not authenticated.'},401,env,request);
      return response({history:await getHistoryForUser(env,s.user.id)},200,env,request);
    }
    if(url.pathname==='/api/profile'&&request.method==='PATCH'){
      const s=await currentSession(env,request);if(!s?.profile)return response({error:'Not authenticated.'},401,env,request);
      const b=await request.json(),bio=typeof b.bio==='string'?b.bio.slice(0,240):undefined,autoRoll=typeof b.autoRoll==='boolean'?b.autoRoll:undefined;
      const patch={};if(bio!==undefined)patch.bio=bio;if(autoRoll!==undefined)patch.auto_roll=autoRoll;if(!Object.keys(patch).length)return response({error:'Nothing to update.'},400,env,request);
      const r=await updateProfile(env,s.user.id,patch);return response({profile:r.data?.[0]||null},r.res.ok?200:500,env,request);
    }
    if(url.pathname==='/api/players'&&request.method==='GET')return await publicPlayers(env,request);
    if(url.pathname.startsWith('/api/player/')&&request.method==='GET')return await publicProfile(env,request,decodeURIComponent(url.pathname.slice('/api/player/'.length)));
    return response({error:'Not found.'},404,env,request);
  } catch(e){console.error(e);return response({error:'Internal server error.'},500,env,request);}
} };
