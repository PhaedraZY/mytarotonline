"use strict";

// Original Lunaria illustrations used in the decorative landing page.
// Reading cards are loaded separately from the complete server-side catalog.
const themes = {
  lunar: {
    title: "月隐之庭", description: "当世界的声音渐渐安静，<br />让一张牌，陪你听见内心的回响。",
    guide: "你不必立刻找到答案。先听听，内心真正想问什么。",
    closing: "愿你相信，温柔也可以是一种前行的力量。",
    note: "A NOTE FROM YOUR INNER GARDEN",
  },
  ember: {
    title: "赤曜书房", description: "在心中尚未熄灭的火光里，<br />让一张牌，照见你真正渴望的方向。",
    guide: "把犹豫留在门外。此刻，什么愿望仍在你的心里燃烧？",
    closing: "愿你守住心中的火，也为自己留一处休憩的光。",
    note: "A NOTE FROM THE CRIMSON STUDY",
  },
  forest: {
    title: "森语回廊", description: "沿着风与叶的低语慢慢走，<br />让一张牌，陪你找回自己的生长节奏。",
    guide: "不用催促自己。在这片林间，你可以按照自己的节奏生长。",
    closing: "愿你像树木一样，向着光，也向着自己的节奏生长。",
    note: "A NOTE FROM THE WHISPERING WOODS",
  },
};

const cards = {
  star: {name:"星星", english:"THE STAR", number:"XVII", keyword:"希望 · 修复 · 重新相信", text:"星星可以象征希望与修复。把它当作一个邀请：回望最近让你感到安定的小事，挑选一件可以持续做的事，让信心在具体的行动里慢慢回来。"},
  moon: {name:"月亮", english:"THE MOON", number:"XVIII", keyword:"感受 · 未知 · 内在觉察", text:"月亮可以象征模糊的感受与尚未看清的部分。试着把“我已知道的事实”和“我担心会发生的事”分别写下，给直觉一点空间，也给求证留一点时间。"},
  hermit: {name:"隐者", english:"THE HERMIT", number:"IX", keyword:"独处 · 倾听 · 内在的光", text:"隐者可以象征沉淀与独立思考。你可以为自己留出一小段不被打扰的时间，问问：如果暂时放下别人的期待，我最想照顾的需要是什么？"},
};

let svgIndex = 0;
function cardSVG(key, isBack = false) {
  const id = `card-${++svgIndex}`;
  const card = cards[key] || cards.moon;
  const stars = [[38,80,1],[193,89,1.1],[47,135,.8],[183,151,.8],[77,106,.6],[160,63,.6],[203,210,.7],[34,229,.6],[61,61,.7],[170,114,.65],[101,82,.5]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="var(--accent)" opacity=".65"/>`).join("");
  const common = `<defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--card)"/><stop offset="1" stop-color="var(--bg)"/></linearGradient><radialGradient id="${id}-halo"><stop stop-color="var(--mist)" stop-opacity=".45"/><stop offset="1" stop-color="var(--mist)" stop-opacity="0"/></radialGradient><linearGradient id="${id}-moon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eee5d2"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs><rect x="1" y="1" width="238" height="388" rx="4" fill="url(#${id}-bg)" stroke="var(--accent)" stroke-opacity=".7"/><rect x="9" y="9" width="222" height="372" rx="2" fill="none" stroke="var(--accent)" stroke-opacity=".25"/><path d="M20 348V115a100 100 0 0 1 200 0v233" fill="none" stroke="var(--accent)" stroke-opacity=".4"/><path d="M27 343V116a93 93 0 0 1 186 0v227" fill="none" stroke="var(--accent)" stroke-opacity=".12"/><circle cx="120" cy="163" r="112" fill="url(#${id}-halo)"/>${stars}`;
  const back = `<rect x="17" y="17" width="206" height="356" fill="none" stroke="var(--accent)" stroke-opacity=".2"/><path d="M120 33 212 195 120 357 28 195Z" fill="none" stroke="var(--accent)" stroke-opacity=".35"/><circle cx="120" cy="195" r="67" fill="none" stroke="var(--accent)" stroke-opacity=".65"/><circle cx="120" cy="195" r="58" fill="none" stroke="var(--accent)" stroke-opacity=".22"/><ellipse cx="120" cy="195" rx="34" ry="89" fill="none" stroke="var(--accent)" stroke-opacity=".27" transform="rotate(35 120 195)"/><path d="M134 161a37 37 0 1 0 0 68 38 38 0 0 1 0-68" fill="url(#${id}-moon)"/><path d="m149 173 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="var(--accent)"/><path d="M120 69v32M104 85h32M120 289v32M104 305h32" stroke="var(--accent)" stroke-opacity=".6"/><text x="120" y="355" text-anchor="middle" fill="var(--accent)" font-family="Georgia,serif" font-size="9" letter-spacing="4">LUNARIA</text>`;
  const moon = `<circle cx="120" cy="141" r="55" fill="none" stroke="var(--accent)" stroke-opacity=".2"/><circle cx="120" cy="141" r="44" fill="none" stroke="var(--accent)" stroke-opacity=".3"/><path d="M133 108a35 35 0 1 0 0 65 36 36 0 0 1 0-65" fill="url(#${id}-moon)"/><path d="m152 122 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" fill="var(--accent)"/><path d="M20 276 56 233 92 270 150 214 220 284v62H20Z" fill="var(--mist)" opacity=".14"/><path d="M20 277 56 233 92 270 150 214 220 284" fill="none" stroke="var(--accent)" stroke-opacity=".45"/><path d="M20 299q50-18 100-2t100 0M20 311q50-15 100-1t100-3M31 324q47-9 89 0t89-3M47 337q35-6 72 0t71-3" fill="none" stroke="var(--accent)" stroke-opacity=".3"/><path d="M116 228h8m-12 13h16m-20 12h24m-27 13h30m-23 13h16" stroke="var(--accent)" stroke-opacity=".35"/>`;
  const star = `<circle cx="120" cy="154" r="62" fill="none" stroke="var(--accent)" stroke-opacity=".2"/><path d="m120 96 10 40 37-23-23 37 40 10-40 10 23 37-37-23-10 40-10-40-37 23 23-37-40-10 40-10-23-37 37 23Z" fill="none" stroke="var(--accent)" stroke-opacity=".75"/><path d="m120 115 8 36 36 9-36 8-8 36-8-36-36-8 36-9Z" fill="url(#${id}-moon)"/><path d="M42 295q34-38 78 0t78 0M26 308q45-32 94 0t94 0M24 322q47-26 96 0t96 0M34 335q42-17 86 0t86 0" fill="none" stroke="var(--accent)" stroke-opacity=".45"/><path d="M120 228v44" stroke="var(--accent)" stroke-opacity=".4" stroke-dasharray="2 6"/><circle cx="120" cy="280" r="3" fill="var(--accent)"/>`;
  const hermit = `<circle cx="120" cy="144" r="53" fill="none" stroke="var(--accent)" stroke-opacity=".2"/><path d="M30 335 92 217l37 57 27-39 54 100Z" fill="var(--mist)" opacity=".17"/><path d="M30 335 92 217l37 57 27-39 54 100M92 217l-7 43 16 22-6 53M156 235l-5 58 20 42" fill="none" stroke="var(--accent)" stroke-opacity=".45"/><path d="M109 174h31v-42h-31Zm-4 0h39m-39-42h39m-33 0 13-16 13 16m-13-16v-11" fill="none" stroke="var(--accent)" stroke-opacity=".85"/><path d="m124 141 4 11 10 3-10 3-4 11-4-11-10-3 10-3Z" fill="url(#${id}-moon)"/><path d="M124 188v28m-28-62H81m86 0h-15m-12-28 11-11m-44 11-11-11" stroke="var(--accent)" stroke-opacity=".3"/>`;
  const front = `<text x="120" y="52" text-anchor="middle" fill="var(--accent)" font-family="Georgia,serif" font-size="10" letter-spacing="3">${card.number}</text>${key === "star" ? star : key === "hermit" ? hermit : moon}<path d="M45 350h150" stroke="var(--accent)" stroke-opacity=".3"/><text x="120" y="369" text-anchor="middle" fill="var(--accent)" font-family="Georgia,serif" font-size="10" letter-spacing="3">${card.english}</text>`;
  return `<svg viewBox="0 0 240 390" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${common}${isBack ? back : front}</svg>`;
}


