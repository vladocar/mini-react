/*! mini-react v0.1.0 | MIT License */
/* Generated from src/mini-react.js by scripts/build.mjs. Do not edit. */
(function () {
'use strict';
/**
 * mini-react.js — a small React-like UI library.
 *
 * How it works, in four steps:
 *   1. Elements:   h('div', props, ...children) returns a plain object that
 *                  DESCRIBES the UI. It never touches the DOM.
 *   2. Mounted tree: the library keeps its own tree of "mounted nodes". Each
 *                  one remembers its DOM node, its children and (for
 *                  components) its hooks.
 *   3. Diff:       on every render, the new elements are compared with the
 *                  mounted tree. Only the differences are written to the DOM.
 *                  Children with a `key` are matched by key, so they keep
 *                  their DOM node and state when the list is reordered.
 *   4. Scheduler:  setState marks a component as "dirty". All dirty
 *                  components re-render together in one microtask (batching),
 *                  parents before children. Effects run after the DOM is
 *                  updated.
 */

const TEXT = Symbol.for('mini-react.text');
const Fragment = Symbol.for('mini-react.fragment');
const SVG_NS = 'http://www.w3.org/2000/svg';

// ─────────────────────────────────────────────────────────────
// 1. Elements
// ─────────────────────────────────────────────────────────────

/**
 * Create an element (a description of UI). Works as a JSX factory:
 *   esbuild --jsx-factory=h --jsx-fragment=Fragment
 */
function createElement(type, config, ...children) {
  const props = {};
  let key;
  let ref;
  if (config != null) {
    for (const name in config) {
      if (name === 'key') key = config.key;
      // For DOM elements `ref` is special. For components it is a normal prop
      // (like React 19), so a component can pass it down to a DOM element.
      else if (name === 'ref' && typeof type === 'string') ref = config.ref;
      else props[name] = config[name];
    }
  }
  if (children.length === 1) props.children = children[0];
  else if (children.length > 1) props.children = children;
  return { type, props, key: key == null ? undefined : String(key), ref };
}

function textElement(value) {
  return { type: TEXT, props: { nodeValue: String(value) } };
}

/** Flatten children into a list of elements. null/true/false are skipped. */
function toChildArray(children, out = []) {
  if (children == null || typeof children === 'boolean') return out;
  if (Array.isArray(children)) {
    for (const child of children) toChildArray(child, out);
  } else if (typeof children === 'object') {
    if (!('type' in children)) {
      throw new Error('Objects are not valid as a child. Did you mean to render an array or a string?');
    }
    out.push(children);
  } else {
    out.push(textElement(children));
  }
  return out;
}

/**
 * What a component returns may be null, a string, an array... We turn it into
 * exactly ONE element. `null` becomes an empty text node, so every component
 * always owns at least one DOM node. That node tells us where the component
 * lives in the page when it re-renders on its own.
 */
function toSingleElement(value) {
  const list = toChildArray(value);
  if (list.length === 0) return textElement('');
  if (list.length === 1) return list[0];
  return { type: Fragment, props: { children: list } };
}

// ─────────────────────────────────────────────────────────────
// 2. Diff: compare new elements with the mounted tree
// ─────────────────────────────────────────────────────────────

/**
 * Update `old` (a mounted node, or null) to match `element`.
 * Returns the mounted node. Mounted nodes are reused and changed in place.
 * New DOM nodes are created detached; `placeChildren` puts them in the page.
 */
/**
 * Set to true when a DOM node is created, removed or possibly reordered.
 * Each DOM element checks it after diffing its children, and skips
 * placeChildren() when nothing about its children's layout changed.
 */
let structureChanged = false;

function diff(element, old, parentInstance, isSvg) {
  if (old && (old.type !== element.type || old.key !== element.key)) {
    unmount(old, true);
    old = null;
  }
  const type = element.type;

  // Text
  if (type === TEXT) {
    const value = element.props.nodeValue;
    if (!old) {
      structureChanged = true;
      return { type, props: element.props, dom: document.createTextNode(value) };
    }
    if (old.props.nodeValue !== value) old.dom.nodeValue = value;
    old.props = element.props;
    return old;
  }

  // Fragment: only children, no DOM node of its own
  if (type === Fragment) {
    const node = old || { type, key: element.key, children: [] };
    let elements = toChildArray(element.props.children);
    if (elements.length === 0) elements = [textElement('')];
    node.children = reconcileChildren(elements, node.children, parentInstance, isSvg);
    node.props = element.props;
    return node;
  }

  // Function component
  if (typeof type === 'function') {
    // memo(): same props and no pending state update, so keep the old output.
    if (old && type._compare && !old.instance.dirty && type._compare(old.props, element.props)) {
      return old;
    }
    const instance = old ? old.instance : {
      type,
      hooks: [],
      parent: parentInstance,
      depth: parentInstance ? parentInstance.depth + 1 : 0,
      isSvg,
      dirty: false,
      unmounted: false,
      queuedEffects: [],
      consumers: null,      // for a context Provider: components that read it
      subscriptions: null,  // Providers this component reads from
    };
    // A Provider got a new value: update every component that reads it,
    // even those behind a memo() that would otherwise be skipped.
    if (old && type._context && instance.consumers && !Object.is(old.props.value, element.props.value)) {
      for (const consumer of instance.consumers) scheduleUpdate(consumer);
    }
    const node = old || { type, key: element.key, instance, rendered: null };
    node.props = instance.props = element.props;
    instance.node = node;
    node.rendered = renderSubtree(instance, node.rendered);
    return node;
  }

  // DOM element
  if (typeof type === 'string') {
    const svg = isSvg || type === 'svg';
    const node = old || {
      type,
      key: element.key,
      dom: svg ? document.createElementNS(SVG_NS, type) : document.createElement(type),
      props: {},
      children: [],
      ref: undefined,
    };
    const elements = toChildArray(element.props.children);
    const outerChanged = structureChanged;
    structureChanged = false;
    // Every old child goes away (list cleared, or replaced by all-new keys):
    // empty the element in one DOM operation instead of removing nodes one by one.
    if (old && node.children.length && noChildSurvives(elements, node.children)) {
      node.children.forEach(destroy);
      node.dom.textContent = '';
      node.children = [];
      structureChanged = true;
    }
    // Children first, so that <select value> can find its <option>s.
    node.children = reconcileChildren(elements, node.children, parentInstance, svg && type !== 'foreignObject');
    // Only touch the order of children when something was added, removed or moved.
    if (structureChanged) placeChildren(node.dom, node.children, null);
    // A new element must be placed by its parent.
    structureChanged = outerChanged || !old;
    updateProps(node.dom, node.props, element.props);
    node.props = element.props;
    if (node.ref !== element.ref) {
      setRef(node.ref, null);
      setRef(element.ref, node.dom);
      node.ref = element.ref;
    }
    return node;
  }

  throw new Error(`Invalid element type: ${String(type)}`);
}

/**
 * Match new child elements with old mounted children.
 * With a key: match by key. Without a key: match by position.
 * Old children that were not matched are removed.
 */
function reconcileChildren(elements, oldChildren, parentInstance, isSvg) {
  const result = new Array(elements.length);

  // Fast path: walk both lists while type and key match at the same position.
  // This covers most updates (same list, items changed in place) with no Map.
  let start = 0;
  const common = Math.min(elements.length, oldChildren.length);
  while (start < common) {
    const element = elements[start];
    const old = oldChildren[start];
    if (old.type !== element.type || old.key !== element.key) break;
    result[start] = diff(element, old, parentInstance, isSvg);
    start++;
  }
  if (start === elements.length) {
    // Items were only removed from the end.
    for (let i = start; i < oldChildren.length; i++) unmount(oldChildren[i], true);
    return result;
  }
  if (start === oldChildren.length) {
    // Items were only added at the end.
    for (let i = start; i < elements.length; i++) result[i] = diff(elements[i], null, parentInstance, isSvg);
    return result;
  }

  // General case for the rest: match by key, or by position when there is no key.
  structureChanged = true; // items may have moved
  const oldByKey = new Map();
  const leftovers = [];
  for (let i = start; i < oldChildren.length; i++) {
    const child = oldChildren[i];
    const k = child.key != null ? 'k:' + child.key : 'i:' + i;
    if (oldByKey.has(k)) leftovers.push(child); // duplicate key
    else oldByKey.set(k, child);
  }
  for (let i = start; i < elements.length; i++) {
    const element = elements[i];
    const k = element.key != null ? 'k:' + element.key : 'i:' + i;
    let old = oldByKey.get(k);
    if (old && old.type === element.type) oldByKey.delete(k);
    else old = null;
    result[i] = diff(element, old, parentInstance, isSvg);
  }

  oldByKey.forEach((child) => unmount(child, true));
  leftovers.forEach((child) => unmount(child, true));
  return result;
}

/** True when no old child can be reused: the new list is empty, or all keys are new. */
function noChildSurvives(elements, oldChildren) {
  if (elements.length === 0) return true;
  const first = elements[0].key;
  // Cheap check first: the usual update keeps the first item.
  if (first == null || first === oldChildren[0].key) return false;
  const oldKeys = new Set();
  for (const child of oldChildren) {
    if (child.key == null) return false;
    oldKeys.add(child.key);
  }
  for (const el of elements) {
    if (el.key == null || oldKeys.has(el.key)) return false;
  }
  return true;
}

/** All top-level DOM nodes of a mounted node (fragments can have many). */
function collectDom(node, out) {
  if (node.dom) out.push(node.dom);
  else if (node.instance) collectDom(node.rendered, out);
  else for (const child of node.children) collectDom(child, out);
  return out;
}

/**
 * Put the DOM nodes of `children` into `parentDom`, in order, just before
 * `anchor` (null = at the end), with as few DOM moves as possible.
 * Nodes that don't move keep their focus, scroll and CSS transitions.
 */
function placeChildren(parentDom, children, anchor) {
  const nodes = [];
  for (const child of children) collectDom(child, nodes);

  // Fast path: from the end, skip nodes that are already in place.
  // Usually everything is, and we stop here.
  let next = anchor;
  let last = nodes.length - 1;
  while (last >= 0 && nodes[last].parentNode === parentDom && nodes[last].nextSibling === next) {
    next = nodes[last--];
  }
  if (last < 0) return;

  // Some nodes are new or out of order. Find where each one is now...
  const position = new Map();
  let index = 0;
  for (let n = parentDom.firstChild; n; n = n.nextSibling) position.set(n, index++);
  const current = new Array(last + 1);
  for (let i = 0; i <= last; i++) {
    current[i] = nodes[i].parentNode === parentDom ? position.get(nodes[i]) : -1;
  }
  // ...keep the longest group that is already in the right order, and move
  // only the others. Swapping 2 rows of 1,000 moves 2 nodes instead of ~1,000.
  const keep = longestIncreasing(current);
  for (let i = last; i >= 0; i--) {
    if (!keep[i]) parentDom.insertBefore(nodes[i], next);
    next = nodes[i];
  }
}

/**
 * Longest increasing subsequence of `seq` (entries < 0 are ignored).
 * Returns a boolean array: true for the positions that are part of it.
 * O(n log n), the same approach Vue 3 and Inferno use.
 */
function longestIncreasing(seq) {
  const tails = [];                         // tails[k] = index ending the best run of length k+1
  const prev = new Array(seq.length);
  for (let i = 0; i < seq.length; i++) {
    const value = seq[i];
    if (value < 0) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < value) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1] : -1;
    tails[lo] = i;
  }
  const keep = new Array(seq.length).fill(false);
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep[i] = true;
  return keep;
}

function unmount(node, removeDom) {
  if (removeDom) {
    structureChanged = true;
    for (const dom of collectDom(node, [])) dom.parentNode && dom.parentNode.removeChild(dom);
  }
  destroy(node);
}

function destroy(node) {
  if (node.instance) {
    const instance = node.instance;
    instance.unmounted = true;
    dirtyQueue.delete(instance);
    if (instance.subscriptions) {
      for (const provider of instance.subscriptions) provider.consumers.delete(instance);
    }
    for (const hook of instance.hooks) {
      if (typeof hook.cleanup === 'function') {
        hook.cleanup();
        hook.cleanup = undefined;
      }
    }
    destroy(node.rendered);
  } else {
    if (node.ref) setRef(node.ref, null);
    if (node.children) node.children.forEach(destroy);
  }
}

function setRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

// ─────────────────────────────────────────────────────────────
// 3. DOM properties, events and styles
// ─────────────────────────────────────────────────────────────

// CSS properties that do NOT get "px" added to numbers (opacity, zIndex, flex...)
const UNITLESS = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
const EVENT_NAMES = { doubleclick: 'dblclick' };

function updateProps(dom, oldProps, newProps) {
  for (const name in oldProps) {
    if (name !== 'children' && !(name in newProps)) setProp(dom, name, undefined, oldProps[name]);
  }
  for (const name in newProps) {
    if (name === 'children') continue;
    const value = newProps[name];
    const old = oldProps[name];
    // value/checked are compared with the live DOM, because the user can change them.
    if (value !== old || name === 'value' || name === 'checked') setProp(dom, name, value, old);
  }
}

function setProp(dom, name, value, old) {
  if (name === 'key' || name === 'ref') return;

  if (name === 'style') {
    setStyle(dom.style, value, old);
    return;
  }

  // Events: one shared listener per event type, handlers stored on the node.
  // Changing the handler on re-render costs nothing.
  if (/^on[A-Z]/.test(name)) {
    let event = name.slice(2).toLowerCase();
    event = EVENT_NAMES[event] || event;
    // Like React: onChange on a text field fires on every keystroke.
    if (event === 'change' && isTextField(dom)) event = 'input';
    const handlers = dom._handlers || (dom._handlers = {});
    if (value && !handlers[event]) dom.addEventListener(event, eventProxy);
    else if (!value && handlers[event]) dom.removeEventListener(event, eventProxy);
    handlers[event] = value;
    return;
  }

  // Form state lives in DOM properties, not attributes.
  if (name === 'value' || name === 'checked' || name === 'selected') {
    const v = name === 'value' ? (value == null ? '' : String(value)) : !!value;
    if (dom[name] !== v) dom[name] = v;
    return;
  }

  if (name === 'className') name = 'class';
  else if (name === 'htmlFor') name = 'for';

  if (value == null || (value === false && !/^(aria|data)-/.test(name))) {
    dom.removeAttribute(name);
  } else {
    dom.setAttribute(name, value === true ? '' : value);
  }
}

function isTextField(dom) {
  const tag = dom.nodeName;
  if (tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && !/^(checkbox|radio|file)$/.test(dom.type);
}

function eventProxy(event) {
  return this._handlers[event.type](event);
}

function setStyle(style, value, old) {
  if (typeof value === 'string') {
    style.cssText = value;
    return;
  }
  if (typeof old === 'string') {
    style.cssText = '';
    old = null;
  }
  if (old) {
    for (const key in old) if (!value || !(key in value)) setStyleProp(style, key, null);
  }
  if (value) {
    for (const key in value) if (!old || value[key] !== old[key]) setStyleProp(style, key, value[key]);
  }
}

function setStyleProp(style, key, value) {
  if (value == null) value = '';
  else if (typeof value === 'number' && key[0] !== '-' && !UNITLESS.test(key)) value += 'px';
  if (key[0] === '-') style.setProperty(key, value); // CSS variables: '--gap'
  else style[key] = value;
}

// ─────────────────────────────────────────────────────────────
// 4. Components, hooks and the update scheduler
// ─────────────────────────────────────────────────────────────

let currentInstance = null;
let hookIndex = 0;
let pendingEffects = [];
const dirtyQueue = new Set();
let flushScheduled = false;

/** Call the component function with hooks connected to `instance`. */
function renderComponent(instance) {
  const prevInstance = currentInstance;
  const prevIndex = hookIndex;
  currentInstance = instance;
  hookIndex = 0;
  instance.dirty = false;
  try {
    return toSingleElement(instance.type(instance.props));
  } finally {
    currentInstance = prevInstance;
    hookIndex = prevIndex;
  }
}

/**
 * Render a component and diff its output. Effects are queued AFTER the
 * subtree, so child effects run before parent effects, like in React.
 */
function renderSubtree(instance, oldRendered) {
  instance.queuedEffects = [];
  const element = renderComponent(instance);
  const rendered = diff(element, oldRendered, instance, instance.isSvg);
  pendingEffects.push(...instance.queuedEffects);
  return rendered;
}

/** Re-render one component in place (after setState). */
function rerender(instance) {
  const node = instance.node;
  const oldDom = collectDom(node.rendered, []);
  const parentDom = oldDom[0].parentNode;
  const anchor = oldDom[oldDom.length - 1].nextSibling;
  node.rendered = renderSubtree(instance, node.rendered);
  placeChildren(parentDom, [node.rendered], anchor);
}

function scheduleUpdate(instance) {
  if (instance.unmounted) return;
  instance.dirty = true;
  dirtyQueue.add(instance);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

function flush() {
  let passes = 0;
  try {
    while (dirtyQueue.size) {
      if (++passes > 50) {
        dirtyQueue.clear();
        throw new Error('Too many re-renders. Do you call setState on every render or in an effect without deps?');
      }
      // Parents first. A parent re-render also re-renders its children,
      // which clears their `dirty` flag, so they are not rendered twice.
      const batch = [...dirtyQueue].sort((a, b) => a.depth - b.depth);
      dirtyQueue.clear();
      for (const instance of batch) {
        if (instance.dirty && !instance.unmounted) rerender(instance);
      }
      runEffects();
    }
  } finally {
    flushScheduled = false;
  }
}

function runEffects() {
  while (pendingEffects.length) {
    const list = pendingEffects;
    pendingEffects = [];
    for (const hook of list) {
      hook.queued = false;
      if (hook.instance.unmounted) continue;
      if (typeof hook.cleanup === 'function') hook.cleanup();
      const cleanup = hook.effect();
      hook.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    }
  }
}

/** Run `fn`, then apply all pending updates right now (useful in tests). */
function flushSync(fn) {
  const result = fn ? fn() : undefined;
  flush();
  return result;
}

function getHook(create) {
  const instance = currentInstance;
  if (!instance) throw new Error('Hooks can only be called inside a function component.');
  const i = hookIndex++;
  if (i === instance.hooks.length) instance.hooks.push(create(instance));
  return instance.hooks[i];
}

function depsChanged(oldDeps, newDeps) {
  return !oldDeps || !newDeps || oldDeps.length !== newDeps.length ||
    newDeps.some((dep, i) => !Object.is(dep, oldDeps[i]));
}

function useReducer(reducer, initialArg, init) {
  const hook = getHook((instance) => ({
    instance,
    state: init ? init(initialArg) : initialArg,
  }));
  hook.reducer = reducer; // always use the latest reducer
  if (!hook.dispatch) {
    hook.dispatch = (action) => {
      const next = hook.reducer(hook.state, action);
      if (Object.is(next, hook.state)) return; // no change, no render
      hook.state = next;
      scheduleUpdate(hook.instance);
    };
  }
  return [hook.state, hook.dispatch];
}

function stateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}

function useState(initial) {
  return useReducer(stateReducer, initial, typeof initial === 'function' ? (fn) => fn() : undefined);
}

/**
 * Runs `effect` after the DOM is updated, when `deps` change.
 * Return a function from `effect` to clean up.
 */
function useEffect(effect, deps) {
  const hook = getHook((instance) => ({ instance }));
  if (depsChanged(hook.deps, deps)) {
    hook.deps = deps;
    hook.effect = effect;
    if (!hook.queued) {
      hook.queued = true;
      hook.instance.queuedEffects.push(hook);
    }
  }
}

// Our effects already run right after the DOM update, before the browser
// paints, so both hooks behave the same here.
const useLayoutEffect = useEffect;

function useMemo(factory, deps) {
  const hook = getHook(() => ({}));
  if (depsChanged(hook.deps, deps)) {
    hook.value = factory();
    hook.deps = deps;
  }
  return hook.value;
}

function useCallback(callback, deps) {
  return useMemo(() => callback, deps);
}

function useRef(initialValue) {
  return getHook(() => ({ current: initialValue }));
}

// ─────────────────────────────────────────────────────────────
// 5. Context
// ─────────────────────────────────────────────────────────────

function createContext(defaultValue) {
  const context = { defaultValue };
  context.Provider = function Provider(props) {
    return props.children;
  };
  context.Provider._context = context;
  return context;
}

function useContext(context) {
  const instance = currentInstance;
  if (!instance) throw new Error('Hooks can only be called inside a function component.');
  for (let p = instance.parent; p; p = p.parent) {
    if (p.type === context.Provider) {
      // Subscribe, so a new value reaches us even through memo() components.
      (p.consumers || (p.consumers = new Set())).add(instance);
      (instance.subscriptions || (instance.subscriptions = new Set())).add(p);
      return p.props.value;
    }
  }
  return context.defaultValue;
}

// ─────────────────────────────────────────────────────────────
// 6. memo
// ─────────────────────────────────────────────────────────────

function shallowEqual(a, b) {
  if (a === b) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!(key in b) || !Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Skip re-rendering a component when its props didn't change.
 * `areEqual(prevProps, nextProps)` returns true to skip (default: shallow compare).
 * The component still re-renders for its own state and for context changes.
 */
function memo(Component, areEqual = shallowEqual) {
  function Memo(props) {
    return Component(props);
  }
  Memo._compare = areEqual;
  Memo.displayName = `memo(${Component.displayName || Component.name || 'Component'})`;
  return Memo;
}

// ─────────────────────────────────────────────────────────────
// 7. Roots
// ─────────────────────────────────────────────────────────────

/** React 18 style: createRoot(container).render(<App />) */
function createRoot(container) {
  let root = null;
  const isSvg = container.namespaceURI === SVG_NS && container.nodeName !== 'foreignObject';
  return {
    render(element) {
      if (!root) container.textContent = '';
      root = diff(toSingleElement(element), root, null, isSvg);
      placeChildren(container, [root], null);
      runEffects();
      flush(); // updates scheduled during this render (e.g. context behind memo)
    },
    unmount() {
      if (root) unmount(root, true);
      root = null;
    },
  };
}

/** Old style: render(<App />, container) */
function render(element, container) {
  if (!container._miniRoot) container._miniRoot = createRoot(container);
  container._miniRoot.render(element);
}

window.MiniReact = { h: createElement, Fragment, createElement, flushSync, useReducer, useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, createContext, useContext, memo, createRoot, render };
})();
