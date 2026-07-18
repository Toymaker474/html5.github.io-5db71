(async()=>{
  const{bootStability}=await import('./stability-ui.js?v=8');
  await bootStability();
  const{app}=await import('./state.js');
  const{render,bootUI}=await import('./ui.js?v=8');
  app.render=render;
  bootUI();
  const{bootRpcUI}=await import('./rpc-ui.js?v=8');
  bootRpcUI();
})().catch(error=>{
  console.error(error);
  if(window.PS_RENDER_SAFE_CRASH)window.PS_RENDER_SAFE_CRASH(error);
  else document.body.innerHTML='<main style="padding:24px;color:white;background:#05070d;min-height:100vh;font-family:-apple-system"><h1>PennySpawn Safe Recovery</h1><p>Refresh once. Heavy local AI is now disabled during startup.</p></main>';
});
