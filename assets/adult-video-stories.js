(()=>{
  const videos=[
    {id:'ssXUIojBz1o',title:'עמית מיטרני במופע לקהל בוגר'},
    {id:'wHy5r6ORg-8',title:'קסמים ואמנות חושים באירוע חברה'},
    {id:'kNBIzGt_Ur0',title:'רגע בלתי נשכח במופע'},
    {id:'H2FnxTajopo',title:'טלפתיה ואמנות חושים מול קהל'},
    {id:'IlPv23NVk1I',title:'תגובות הקהל ברגעי הסיום'},
    {id:'THbIq6-QgUk',title:'האנרגיה שנשארת בחדר'},
    {id:'-WdN4KHotTE',title:'הרגע שבו הקהל נשאר בלי מילים'}
  ];
  const copy={
    companies:{eyebrow:'אירועים עסקיים בפעולה',title:'רגעים אמיתיים מאירועי חברות',intro:'טעימות קצרות מהמופע, מהמפגש עם העובדים ומהאנרגיה שנוצרת בחדר.'},
    adults:{eyebrow:'רגעים אמיתיים מהאירוע',title:'כשהמופע פוגש את הקהל',intro:'הצצה לקצב, להפתעה ולאנרגיה שנוצרת בין עמית לקהל לאורך הערב.'},
    mitzvah:{eyebrow:'חוויה לכל המשפחה',title:'כשהנוער והמבוגרים נשאבים לאותו רגע',intro:'מבחר קטעים שממחיש איך המופע מתחבר לקהל רב־גילאי בלי להרגיש ילדותי.'},
    brit:{eyebrow:'תוכן שמתאים לכל האורחים',title:'קסמים שמחברים בין הדורות',intro:'רגעים קצרים שמראים כיצד גם המבוגרים וגם המשפחה נכנסים יחד לחוויה.'}
  };
  const contexts={'shows-for-companies.html':'companies','mentalist-adult-parties.html':'adults','magician-bar-bat-mitzvah.html':'mitzvah','magician-brit-brita.html':'brit'};
  if(!document.querySelector('[data-adult-video-stories]')){
    const legacy=document.querySelector('.experience');
    if(legacy){const oldSection=legacy.closest('section');const section=document.createElement('section');const shell=document.createElement('div');const mount=document.createElement('div');const context=contexts[location.pathname.split('/').pop()]||'adults';shell.className='shell';mount.dataset.adultVideoStories='';mount.dataset.context=context;shell.appendChild(mount);section.appendChild(shell);if(context==='adults'){document.querySelector('.hero')?.after(section)}else{oldSection.before(section)}oldSection.hidden=true}
  }
  if(contexts[location.pathname.split('/').pop()]==='companies'){document.querySelectorAll('.more-media').forEach(element=>element.hidden=true)}
  document.querySelectorAll('[data-adult-video-stories]').forEach(root=>{
    const text=copy[root.dataset.context]||copy.adults; let active=0;
    root.className='adult-video-stories';
    root.innerHTML=`<div class="adult-video-stories__head"><div class="adult-video-stories__eyebrow">${text.eyebrow}</div><h2>${text.title}</h2><p class="adult-video-stories__intro">${text.intro}</p></div><div class="adult-video-stories__layout"><div class="adult-video-stories__player"><iframe title="${videos[0].title}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><div class="adult-video-stories__meta"><div class="adult-video-stories__count"></div><h3 class="adult-video-stories__title"></h3><div class="adult-video-stories__nav" role="list"></div><div class="adult-video-stories__actions"><button class="adult-video-stories__arrow" data-prev>הקודם</button><button class="adult-video-stories__arrow" data-next>הבא</button></div></div></div>`;
    const frame=root.querySelector('iframe'),nav=root.querySelector('.adult-video-stories__nav'),count=root.querySelector('.adult-video-stories__count'),title=root.querySelector('.adult-video-stories__title');
    videos.forEach((video,index)=>{const button=document.createElement('button');button.className='adult-video-stories__item';button.type='button';button.setAttribute('role','listitem');button.innerHTML=`<img class="adult-video-stories__thumb" src="https://i.ytimg.com/vi/${video.id}/hqdefault.jpg" alt="" loading="lazy"><span>${video.title}</span>`;button.addEventListener('click',()=>show(index));nav.appendChild(button)});
    const buttons=[...nav.children]; function show(index){active=(index+videos.length)%videos.length;const video=videos[active];frame.src=`https://www.youtube-nocookie.com/embed/${video.id}?rel=0`;frame.title=video.title;count.textContent=`סרטון ${active+1} מתוך ${videos.length}`;title.textContent=video.title;buttons.forEach((button,i)=>button.setAttribute('aria-current',String(i===active)))}
    root.querySelector('[data-prev]').addEventListener('click',()=>show(active-1));root.querySelector('[data-next]').addEventListener('click',()=>show(active+1));show(0);
  });
})();
