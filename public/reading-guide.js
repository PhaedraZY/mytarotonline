// Shared by the browser edition and Node backend. This is a reading aid, not AI.
const SPREAD_GUIDES = {
  one: '先选出最符合你实际处境的一句话，再检查它与最近的一件具体事情是否对应。单张牌提供一个观察角度，不需要把所有解释都套到自己身上。',
  three: '先对照「当下」和「未见之处」：你已经注意到的，与尚未认真考虑的，是否在说同一件事？再看「前行的指引」，选出自己能够调整的一步。若两张牌看起来矛盾，先检查它们是否对应不同需要。',
  timeline: '把三张牌当作一条变化线索：过去有哪些经验或习惯仍在影响现在？当下有什么可以调整？「接下来的倾向」只用于探索延续当前做法时的可能方向，行动和新信息都可以改变它。',
  decision: '先写清选项 A 和 B，再分别比较两边的「可能带来的帮助」与「需要承担的代价」。最后回到第一张牌所提示的选择标准。不要按正逆位或好牌数量计分；现实中的时间、收入、责任和承受能力同样需要核实。',
  relationship: '从「我的需要」开始，对照你实际观察到的互动，分清事实与猜测。再看连接点和卡住的地方，尝试把最后一张牌转成一句可以直接沟通的话。这里不能替对方确认感受，关系的答案仍需要双方的回应。',
  cross: '先看中心处境，再比较阻力和已有支持：哪些来自现实限制，哪些可能来自习惯？用「需要看清的事」检查遗漏的信息，最后把「下一步」落实为一件能做、也能复盘的小事。',
};

export function referenceInterpretation(reading) {
  const last = reading.drawn.at(-1);
  const lastMeaning = last?.card?.[last.orientation];
  return {
    summary: '下面依次说明牌面的画面象征、正逆位含义，以及它所在的牌位可以怎样理解。这是资料库提供的阅读指引，未使用 AI；请把与你的问题相符的部分留下，不符合的部分不必勉强套用。',
    cards: reading.drawn.map(draw => {
      const meaning = draw.card[draw.orientation];
      const position = reading.positions.find(item => item.id === draw.positionId);
      const paragraphs = [
        draw.card.symbolism ? `经典牌面象征：${draw.card.symbolism}` : '',
        `${draw.orientation === 'reversed' ? '逆位' : '正位'}怎么理解：${meaning.meaning}`,
        `放在「${draw.positionLabel}」：${position?.description || '请把这张牌的含义放回这个牌位，再与你已经知道的情况对照。'}`,
        reading.spreadId === 'relationship' && meaning.relationships
          ? `在关系中可以观察：${meaning.relationships}`
          : meaning.everyday ? `生活里可能的表现：${meaning.everyday}` : '',
        meaning.advice ? `可以尝试：${meaning.advice}` : '',
      ].filter(Boolean);
      return {
        cardId: draw.cardId, positionId: draw.positionId, orientation: draw.orientation,
        symbolAnchor: meaning.keywords.join(' · '), interpretation: paragraphs.join('\n\n'),
        reflectionQuestion: meaning.reflection || `在「${draw.positionLabel}」这个方面，有哪件实际发生的事支持或不支持这张牌的提示？`,
      };
    }),
    synthesis: SPREAD_GUIDES[reading.spreadId] || SPREAD_GUIDES.three,
    actions: [
      lastMeaning?.advice || '写下一个你已经知道的事实，以及一个仍需要验证的假设。',
      reading.requiredCount > 1 ? '从这组牌里挑出最有共鸣、也最不确定的一点，写下你准备怎样向现实核实。' : '过几天回看记录：这张牌帮助你注意到了什么，又有哪些部分并不适用？',
    ],
    closing: '你可以认真对待自己的感受，也给事实和新的选择留一点空间。',
  };
}
