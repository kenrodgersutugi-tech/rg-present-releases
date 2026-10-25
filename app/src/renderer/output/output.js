// fitContainer: the slide takes the shape of this screen, so it fills a 16:9, 16:10, 4:3 or
// ultrawide projector completely instead of sitting letterboxed inside it.
const stage = RGRender.createStage(document.getElementById('screen'), { fitContainer: true });
stage.show({ mode: 'blank', cover: 'black', transition: { type: 'cut' } });
window.rg.on('output:render', (p) => stage.show(p));
