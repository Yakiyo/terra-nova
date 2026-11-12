import { initPlanetJourney } from './planet-journey.js';

const desktop = matchMedia('(min-width: 1021px), (hover: hover) and (pointer: fine)');
if (desktop.matches) {
  const analogs = [
    { name: 'Lanzarote, Spain', lat: 29.04, lon: -13.63, kind: 'Moon & Mars geology', detail: 'ESA PANGAEA trains astronauts in planetary field geology across its volcanic terrain.', source_url: 'https://www.esa.int/Newsroom/Press_Releases/Media_invitation_Astronaut_geology_training_in_Lanzarote_for_future_missions_to_Moon_and_Mars', dataset_id: 'esa_pangaea_lanzarote' },
    { name: 'Atacama Desert, Chile', lat: -23.5, lon: -68.2, kind: 'Mars life detection', detail: 'NASA has used the dry desert to test life-detection instruments and rover drilling.', source_url: 'https://astrobiology.nasa.gov/research-locations/', dataset_id: 'nasa_astrobiology_atacama' },
    { name: 'Devon Island, Canada', lat: 75.4, lon: -89.8, kind: 'Mars mission operations', detail: 'The Haughton-Mars Project studies exploration in an isolated Arctic analog environment.', source_url: 'https://ntrs.nasa.gov/api/citations/20240011157/downloads/NASA%20TM20240011157.pdf', dataset_id: 'nasa_haughton_mars_project' },
    { name: 'Mauna Kea, Hawaiʻi', lat: 19.82, lon: -155.47, kind: 'Lunar resource testing', detail: 'NASA field-tested lunar resource prospecting systems on this volcanic terrain.', source_url: 'https://www.nasa.gov/mission/in-situ-resource-utilization-isru/', dataset_id: 'nasa_isru_mauna_kea' },
    { name: 'Black Point Lava Flow, Arizona', lat: 35.68, lon: -111.47, kind: 'Lunar rover operations', detail: 'NASA and JAXA tested pressurized rover operations in this simulated lunar environment.', source_url: 'https://www.nasa.gov/humans-in-space/nasa-practices-rover-operations-in-simulated-lunar-environment/', dataset_id: 'nasa_drats_black_point' },
  ];
  const root = document.createElement('div');
  root.className = 'cinematic';
  root.innerHTML = `
    <canvas class="cinematic-canvas" aria-hidden="true"></canvas>
    <div class="cinematic-space-media" aria-hidden="true"><video muted loop playsinline preload="none"></video></div>
    <div class="cinematic-chapters">
      <section class="cinematic-chapter chapter-hero" id="cinematic-start"><div class="cinematic-copy"><h1>Our next frontier<br><em>Begins on Earth</em></h1><p>Find Earth analogs for Moon and Mars bases.</p><a class="cinematic-scroll" href="#cinematic-orbit" aria-label="Scroll to Earth from orbit"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"/></svg></a></div></section>
      <section class="cinematic-chapter chapter-orbit" id="cinematic-orbit" aria-label="Earth from orbit"><div class="cinematic-copy"><blockquote><p>Our next frontier<br>begins on Earth</p><footer>TerraNova</footer></blockquote><p>Explore places beyond Earth, then find where their conditions echo on our own planet.</p></div></section>
      <section class="cinematic-chapter chapter-moon" id="cinematic-moon"><div class="cinematic-copy cinematic-list"><h2>The Moon</h2><p>Choose a lunar site to inspect its story.</p><div class="cinematic-targets" data-body="Moon"></div></div></section>
      <section class="cinematic-chapter chapter-mars" id="cinematic-mars"><div class="cinematic-copy cinematic-list"><h2>Mars</h2><p>Explore the places shaping future exploration.</p><div class="cinematic-targets" data-body="Mars"></div></div></section>
      <section class="cinematic-chapter chapter-analogs" id="cinematic-analogs"><div class="cinematic-copy cinematic-list"><h2>Other worlds.<br>Closer than you think.</h2><p>These places have hosted real Moon and Mars exploration work. Click a location to travel there.</p><div class="cinematic-analog-list"></div><div class="cinematic-analog-detail" aria-live="polite"></div></div></section>
      <section class="cinematic-chapter chapter-finale" id="cinematic-finale"><div class="cinematic-copy"><h2>The next discovery<br>starts here.</h2><p>Find a place on Earth that helps us understand another world.</p><a class="cinematic-launch" href="finder.html" aria-description="Opens the Finder globe and ranked Earth locations">Take me to Finder</a></div></section>
    </div>
    <div class="cinematic-blackout" aria-hidden="true"></div>`;
  document.querySelector('.site-header').after(root);
  document.body.classList.add('cinematic-active');
  document.documentElement.classList.remove('cinematic-pending');
  document.querySelector('main#main').id='legacy-main';root.id='main';

  const chapters = [...root.querySelectorAll('.cinematic-chapter')];
  const chevron = root.querySelector('.cinematic-scroll svg').outerHTML;
  chapters.forEach((chapter, index) => {
    if (chapter.querySelector('.cinematic-scroll')) return;
    const next = chapters[index + 1];
    const link = document.createElement('a');
    link.className = 'cinematic-scroll';
    link.href = next ? `#${next.id}` : 'finder.html';
    link.setAttribute('aria-label', next ? `Continue to ${next.querySelector('h2')?.textContent || next.getAttribute('aria-label')}` : 'Open Finder');
    if (!next) link.dataset.finderLaunch = '';
    link.innerHTML = chevron;
    chapter.querySelector('.cinematic-copy').append(link);
  });

  let selectedAnalog = 0, selectedMoon = 0, selectedMars = 0;
  const targetLists = {Moon:[],Mars:[]};
  const detail = root.querySelector('.cinematic-analog-detail');
  const list = root.querySelector('.cinematic-analog-list');
  const showAnalog = index => {
    selectedAnalog = index;
    const site = analogs[index];
    detail.replaceChildren();
    list.querySelectorAll('button').forEach((button,i) => button.setAttribute('aria-pressed', String(i===index)));
  };
  analogs.forEach((site,i) => {
    const button = document.createElement('button'); button.type='button'; button.textContent=site.name;
    button.addEventListener('click',()=>showAnalog(i));
    list.append(button);
  }); showAnalog(0);
  const regionalThumb=(body,target)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=112;canvas.className='regional-thumb';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Regional surface map around ${target.name}`);
    const map=new Image();map.onload=()=>{const context=canvas.getContext('2d');const w=map.naturalWidth,h=map.naturalHeight,size=w/12;const u=((Number(target.longitude)+180)%360+360)%360/360,v=(90-Number(target.latitude))/180;const x=u*w-size/2,y=Math.max(0,Math.min(h-size,v*h-size/2));context.drawImage(map,Math.max(0,Math.min(w-size,x)),y,size,size,0,0,112,112);};map.src=`assets/cinematic/${body.toLowerCase()}.jpg`;return canvas;
  };
  fetch('/api/targets').then(r=>r.ok?r.json():Promise.reject()).then(payload => {
    const targets = payload.targets || [];
    for (const body of ['Moon','Mars']) {
      const box = root.querySelector(`[data-body="${body}"]`);
      targetLists[body]=targets.filter(t=>t.body===body).slice(0,3);
      targetLists[body].forEach((target,i)=>{
        const row=document.createElement('div'); row.className='cinematic-target';
        const image=regionalThumb(body,target);
        const button=document.createElement('button'); button.type='button'; button.textContent=target.name;
        button.setAttribute('aria-pressed', String(i===0));
        button.addEventListener('click',()=>{ if(body==='Moon') selectedMoon=i; else selectedMars=i; box.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));  });
        const link=document.createElement('a'); link.href=`finder.html#target=${encodeURIComponent(target.id)}`; link.textContent=target.name;link.className='cinematic-site-link';link.setAttribute('aria-label',`Find analogs for ${target.name}`);
        row.append(image,link); box.append(row);
      });

    }
  }).catch(()=>root.querySelectorAll('.cinematic-targets').forEach(box=>box.innerHTML='<p>Target catalog is unavailable. Use View all targets to retry.</p>'));

  try {
    initPlanetJourney(root, chapter => {
      if(chapter===4) return analogs[selectedAnalog];
      const body=chapter===2?'Moon':chapter===3?'Mars':null;
      if(!body) return null;
      const target=targetLists[body][body==='Moon'?selectedMoon:selectedMars];
      return target?{name:target.name,lat:Number(target.latitude),lon:Number(target.longitude)}:null;
    });
  } catch(error) { console.error('Planet scene unavailable',error);root.classList.add('cinematic-no-webgl'); }
}
