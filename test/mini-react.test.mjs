// Run with:  npm test
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><body></body>');
globalThis.window = window;
globalThis.document = window.document;

const {
  h, Fragment, createRoot, useState, useEffect, useRef, useMemo, useReducer,
  createContext, useContext, flushSync, memo,
} = await import('../src/mini-react.js');

// Counts DOM insertions (moves and new nodes) inside `container` while `fn` runs.
function countInserts(container, fn) {
  const original = window.Node.prototype.insertBefore;
  let count = 0;
  window.Node.prototype.insertBefore = function (...args) {
    if (container.contains(this)) count++;
    return original.apply(this, args);
  };
  try { fn(); } finally { window.Node.prototype.insertBefore = original; }
  return count;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

test('renders elements, text, attributes and styles', () => {
  const { container, root } = setup();
  root.render(h('div', { className: 'box', style: { width: 10, opacity: 0.5 }, 'data-x': 1 },
    h('span', null, 'Hello ', 42), null, false, h('b', null, 'end')));
  assert.equal(container.innerHTML,
    '<div class="box" style="width: 10px; opacity: 0.5;" data-x="1"><span>Hello 42</span><b>end</b></div>');
});

test('useState + click re-renders, and updates are batched', async () => {
  const { container, root } = setup();
  let renders = 0;
  function Counter() {
    renders++;
    const [n, setN] = useState(0);
    return h('button', { onClick: () => { setN((x) => x + 1); setN((x) => x + 1); } }, 'Count: ', n);
  }
  root.render(h(Counter));
  const button = container.querySelector('button');
  click(button);
  await tick();
  assert.equal(button.textContent, 'Count: 2');
  assert.equal(renders, 2);
  assert.equal(container.querySelector('button'), button, 'same DOM node reused');
});

test('keyed list reorder keeps DOM nodes', () => {
  const { container, root } = setup();
  const list = (items) => h('ul', null, items.map((i) => h('li', { key: i }, i)));
  root.render(list(['a', 'b', 'c']));
  const [a, b, c] = container.querySelectorAll('li');
  root.render(list(['c', 'a', 'd', 'b']));
  const lis = [...container.querySelectorAll('li')];
  assert.deepEqual(lis.map((li) => li.textContent), ['c', 'a', 'd', 'b']);
  assert.equal(lis[0], c);
  assert.equal(lis[1], a);
  assert.equal(lis[3], b);
  root.render(list(['b']));
  assert.equal(container.querySelector('ul').innerHTML, '<li>b</li>');
  assert.equal(container.querySelector('li'), b);
});

test('keyed components keep their state when moved', async () => {
  const { container, root } = setup();
  const setters = {};
  function Item({ id }) {
    const [v, setV] = useState(0);
    setters[id] = setV;
    return h('li', null, id, ':', v);
  }
  const list = (ids) => h('ul', null, ids.map((id) => h(Item, { key: id, id })));
  root.render(list(['x', 'y']));
  setters.x(5);
  await tick();
  root.render(list(['y', 'x']));
  assert.equal(container.textContent, 'y:0x:5');
});

test('effects run after commit, clean up on deps change and unmount', async () => {
  const { container, root } = setup();
  const log = [];
  function Child({ n }) {
    useEffect(() => {
      log.push(`child effect ${n}, in DOM: ${container.contains(document.getElementById('c'))}`);
      return () => log.push(`child cleanup ${n}`);
    }, [n]);
    return h('i', { id: 'c' }, n);
  }
  function Parent({ n, show }) {
    useEffect(() => { log.push('parent effect'); }, []);
    return show ? h(Child, { n }) : null;
  }
  root.render(h(Parent, { n: 1, show: true }));
  root.render(h(Parent, { n: 1, show: true })); // same deps: no effect
  root.render(h(Parent, { n: 2, show: true }));
  root.render(h(Parent, { n: 2, show: false }));
  assert.deepEqual(log, [
    'child effect 1, in DOM: true',
    'parent effect',
    'child cleanup 1',
    'child effect 2, in DOM: true',
    'child cleanup 2',
  ]);
  assert.equal(container.innerHTML, '');
});

test('context reaches deep children and updates them', async () => {
  const { container, root } = setup();
  const Theme = createContext('light');
  let setTheme;
  const Leaf = () => h('p', null, useContext(Theme));
  const Middle = () => h('div', null, h(Leaf));
  function App() {
    const [t, set] = useState('dark');
    setTheme = set;
    return h(Fragment, null, h(Theme.Provider, { value: t }, h(Middle)), h(Leaf));
  }
  root.render(h(App));
  assert.equal(container.textContent, 'darklight');
  setTheme('blue');
  await tick();
  assert.equal(container.textContent, 'bluelight');
});

test('a component inside siblings re-renders in the right place', async () => {
  const { container, root } = setup();
  let toggle;
  function Middle() {
    const [open, setOpen] = useState(false);
    toggle = () => setOpen((o) => !o);
    return open ? h(Fragment, null, h('b', null, '1'), h('b', null, '2')) : null;
  }
  root.render(h('div', null, h('a', null, 'start'), h(Middle), h('a', null, 'end')));
  const div = container.firstChild;
  assert.equal(div.textContent, 'startend');
  toggle(); await tick();
  assert.equal(div.innerHTML, '<a>start</a><b>1</b><b>2</b><a>end</a>');
  toggle(); await tick();
  assert.equal(div.textContent, 'startend');
  toggle(); await tick();
  assert.equal(div.innerHTML, '<a>start</a><b>1</b><b>2</b><a>end</a>');
});

test('parent and child both dirty: child renders once', async () => {
  const { root } = setup();
  let childRenders = 0, setP, setC;
  function Child() { childRenders++; const [, s] = useState(0); setC = s; return 'c'; }
  function Parent() { const [, s] = useState(0); setP = s; return h(Child); }
  root.render(h(Parent));
  setC(1); setP(1);
  await tick();
  assert.equal(childRenders, 2);
});

test('changing element type replaces the node', () => {
  const { container, root } = setup();
  root.render(h('div', null, h('span', null, 'a')));
  root.render(h('div', null, h('p', null, 'b')));
  assert.equal(container.innerHTML, '<div><p>b</p></div>');
});

test('SVG elements use the SVG namespace', () => {
  const { container, root } = setup();
  root.render(h('svg', { viewBox: '0 0 10 10' }, h('circle', { r: 5, className: 'dot' })));
  const circle = container.querySelector('circle');
  assert.equal(circle.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(circle.getAttribute('class'), 'dot');
});

test('controlled input, refs, useMemo and useReducer', async () => {
  const { container, root } = setup();
  let memoRuns = 0;
  function Form() {
    const [text, setText] = useState('hi');
    const [count, dispatch] = useReducer((s, a) => (a === 'inc' ? s + 1 : s), 0);
    const ref = useRef(null);
    const upper = useMemo(() => { memoRuns++; return text.toUpperCase(); }, [text]);
    return h('div', null,
      h('input', { ref, value: text, onInput: (e) => setText(e.target.value) }),
      h('button', { onClick: () => dispatch('inc') }, count),
      h('p', null, upper, ref.current ? ' (ref ok)' : ''));
  }
  root.render(h(Form));
  const input = container.querySelector('input');
  assert.equal(input.value, 'hi');
  input.value = 'hey';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick();
  assert.equal(container.querySelector('p').textContent, 'HEY (ref ok)');
  click(container.querySelector('button'));
  await tick();
  assert.equal(container.querySelector('button').textContent, '1');
  assert.equal(memoRuns, 2, 'memo only recomputed when text changed');
});

test('event handlers can change and be removed', () => {
  const { container, root } = setup();
  const log = [];
  root.render(h('button', { onClick: () => log.push('a') }));
  click(container.firstChild);
  root.render(h('button', { onClick: () => log.push('b') }));
  click(container.firstChild);
  root.render(h('button', null));
  click(container.firstChild);
  assert.deepEqual(log, ['a', 'b']);
});

test('onChange on a text input fires on every keystroke (like React)', async () => {
  const { container, root } = setup();
  function F() {
    const [v, setV] = useState('');
    return h('div', null, h('input', { type: 'text', value: v, onChange: (e) => setV(e.target.value) }), h('p', null, v));
  }
  root.render(h(F));
  const input = container.querySelector('input');
  input.value = 'ab';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await tick();
  assert.equal(container.querySelector('p').textContent, 'ab');
});

test('setState after unmount is ignored; flushSync applies updates now', () => {
  const { container, root } = setup();
  let set;
  function C() { const [v, s] = useState('a'); set = s; return v; }
  root.render(h(C));
  flushSync(() => set('b'));
  assert.equal(container.textContent, 'b');
  root.unmount();
  flushSync(() => set('c'));
  assert.equal(container.innerHTML, '');
});

test('memo skips re-render when props are equal, but not for own state', async () => {
  const { container, root } = setup();
  let renders = 0, setOwn;
  const Item = memo(function Item({ label }) {
    renders++;
    const [n, set] = useState(0);
    setOwn = set;
    return h('i', null, label, n);
  });
  root.render(h('div', null, h(Item, { label: 'a' })));
  root.render(h('div', null, h(Item, { label: 'a' })));
  assert.equal(renders, 1, 'same props: skipped');
  root.render(h('div', null, h(Item, { label: 'b' })));
  assert.equal(renders, 2, 'new props: rendered');
  setOwn(5); await tick();
  assert.equal(renders, 3, 'own state: rendered');
  assert.equal(container.textContent, 'b5');
});

test('memo with a custom compare function', () => {
  const { container, root } = setup();
  const Price = memo(({ value }) => h('b', null, value.toFixed(2)), (a, b) => Math.abs(a.value - b.value) < 0.01);
  root.render(h(Price, { value: 1 }));
  root.render(h(Price, { value: 1.001 }));
  assert.equal(container.textContent, '1.00');
  root.render(h(Price, { value: 2 }));
  assert.equal(container.textContent, '2.00');
});

test('context updates reach consumers behind a memo boundary', async () => {
  const { container, root } = setup();
  const Theme = createContext('light');
  let setTheme, blockedRenders = 0;
  const Leaf = () => h('p', null, useContext(Theme));
  const Blocker = memo(() => { blockedRenders++; return h('div', null, h(Leaf)); });
  function App() {
    const [t, set] = useState('dark');
    setTheme = set;
    return h(Theme.Provider, { value: t }, h(Blocker));
  }
  root.render(h(App));
  setTheme('blue'); await tick();
  assert.equal(container.textContent, 'blue');
  assert.equal(blockedRenders, 1, 'the memo component itself did not re-render');
  root.unmount();
});

test('swapping 2 of 1,000 keyed rows moves only 2 DOM nodes', () => {
  const { container, root } = setup();
  const ids = Array.from({ length: 1000 }, (_, i) => i);
  const list = (order) => h('ul', null, order.map((i) => h('li', { key: i }, i)));
  root.render(list(ids));
  const swapped = ids.slice();
  [swapped[1], swapped[998]] = [swapped[998], swapped[1]];
  const moves = countInserts(container, () => root.render(list(swapped)));
  assert.equal(moves, 2);
  assert.deepEqual([...container.querySelectorAll('li')].map((li) => Number(li.textContent)), swapped);
});

test('random reorders, inserts and removals always give the right order', () => {
  const { container, root } = setup();
  let seed = 7;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  const list = (order) => h('ul', null, order.map((i) => h('li', { key: i }, i)));
  let order = Array.from({ length: 30 }, (_, i) => i);
  root.render(list(order));
  let nextKey = 30;
  for (let round = 0; round < 200; round++) {
    order = order.filter(() => rnd(6) !== 0);                   // remove some
    for (let i = rnd(4); i > 0; i--) order.splice(rnd(order.length + 1), 0, nextKey++); // insert some
    for (let i = rnd(5); i > 0; i--) {                           // move some
      const [x] = order.splice(rnd(order.length), 1);
      if (x !== undefined) order.splice(rnd(order.length + 1), 0, x);
    }
    root.render(list(order));
    const shown = [...container.querySelectorAll('li')].map((li) => Number(li.textContent));
    assert.deepEqual(shown, order, `round ${round}`);
  }
});

test('reorder inside a fragment between siblings keeps the siblings in place', async () => {
  const { container, root } = setup();
  let setOrder;
  function Middle() {
    const [order, set] = useState(['a', 'b', 'c']);
    setOrder = set;
    return h(Fragment, null, order.map((k) => h('b', { key: k }, k)));
  }
  root.render(h('div', null, h('i', null, '['), h(Middle), h('i', null, ']')));
  setOrder(['c', 'a', 'b']); await tick();
  assert.equal(container.textContent, '[cab]');
  setOrder(['b', 'x', 'c']); await tick();
  assert.equal(container.textContent, '[bxc]');
});

test('replacing a whole keyed list still runs cleanups and clears refs', () => {
  const { container, root } = setup();
  const log = [];
  const refs = {};
  function Row({ id }) {
    useEffect(() => () => log.push(`cleanup ${id}`), []);
    return h('li', { ref: (el) => { refs[id] = el; } }, id);
  }
  const list = (ids) => h('ul', null, ids.map((id) => h(Row, { key: id, id })));
  root.render(list(['a', 'b']));
  root.render(list(['c', 'd']));
  assert.deepEqual(log.sort(), ['cleanup a', 'cleanup b']);
  assert.equal(refs.a, null);
  assert.equal(container.textContent, 'cd');
  root.render(list([]));
  assert.equal(container.querySelector('ul').childNodes.length, 0);
});

test('child output that changes shape during a parent render is placed correctly', () => {
  const { container, root } = setup();
  const Items = ({ n, tag }) => h(Fragment, null, Array.from({ length: n }, (_, i) => h(tag, null, i)));
  const app = (n, tag) => h('div', null, h('i', null, '<'), h(Items, { n, tag }), h('i', null, '>'), n > 1 ? 'x' : null);
  const steps = [[2, 'b'], [0, 'b'], [3, 'b'], [3, 'u'], [1, 'u'], [4, 's']];
  for (const [n, tag] of steps) {
    root.render(app(n, tag));
    const expected = `<div><i>&lt;</i>${Array.from({ length: n }, (_, i) => `<${tag}>${i}</${tag}>`).join('')}<i>&gt;</i>${n > 1 ? 'x' : ''}</div>`;
    assert.equal(container.innerHTML, expected, `n=${n} tag=${tag}`);
  }
});

test('appending to an unkeyed list only inserts the new nodes', () => {
  const { container, root } = setup();
  const list = (n) => h('ul', null, Array.from({ length: n }, (_, i) => h('li', null, i)));
  root.render(list(100));
  const inserts = countInserts(container, () => root.render(list(110)));
  assert.equal(inserts, 10);
});

for (const file of ['mini-react.global.js', 'mini-react.min.js']) {
  test(`browser build dist/${file} matches the module exports`, async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
    const dom = new JSDOM('<!doctype html><div id="app"></div>', { runScripts: 'outside-only' });
    dom.window.eval(code);
    const G = dom.window.MiniReact;
    const esm = await import('../src/mini-react.js');
    assert.deepEqual(Object.keys(G).sort(), Object.keys(esm).sort());
    let setN;
    function C() { const [n, s] = G.useState(1); setN = s; return G.h('b', null, n); }
    const root = G.createRoot(dom.window.document.getElementById('app'));
    root.render(G.h(C));
    G.flushSync(() => setN(2));
    assert.equal(dom.window.document.getElementById('app').innerHTML, '<b>2</b>');
  });
}

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (err) {
    failed++;
    console.log('  ✗', name, '\n   ', err.message);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
