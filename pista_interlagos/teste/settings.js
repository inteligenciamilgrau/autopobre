export function setupSettings(pause){
 const dialog=document.getElementById('settings'),tabs=[...dialog.querySelectorAll('[role=tab]')];
 const select=tab=>{for(const item of tabs){const active=item===tab;item.setAttribute('aria-selected',String(active));item.tabIndex=active?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!active;}};
 for(const tab of tabs){tab.onclick=()=>select(tab);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+tabs.length)%tabs.length;select(tabs[index]);tabs[index].focus();};}
 const close=()=>dialog.close();document.getElementById('settingsClose').onclick=close;document.getElementById('settingsBack').onclick=close;
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('close',()=>document.getElementById('settingsButton').focus());
 return ()=>{pause();if(!dialog.open)dialog.showModal();};
}
