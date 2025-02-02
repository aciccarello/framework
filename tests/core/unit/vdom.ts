const { afterEach, beforeEach, describe, it } = intern.getInterface('bdd');
const { assert } = intern.getPlugin('chai');
const { describe: jsdomDescribe } = intern.getPlugin('jsdom');
import { match, spy, stub, SinonSpy, SinonStub } from 'sinon';
import { add } from '../../../src/core/has';
import { createResolvers } from './../support/util';
import sendEvent from '../support/sendEvent';

import { create, renderer, invalidator, widgetInstanceMap, v, w, dom as d } from '../../../src/core/vdom';
import { VNode, DNode, DomVNode } from '../../../src/core/interfaces';
import { WidgetBase } from '../../../src/core/WidgetBase';
import Registry from '../../../src/core/Registry';
import { I18nMixin } from '../../../src/core/mixins/I18n';
import registry from '../../../src/core/decorators/registry';
import { alwaysRender } from '../../../src/core/decorators/alwaysRender';

const resolvers = createResolvers();

function getWidget(renderResult: any) {
	let meta: any = {};
	return [
		class extends WidgetBase {
			private _renderResult: any | (() => any) = renderResult;
			private _nodeHandlerStub = {
				add: stub(),
				addRoot: stub()
			};
			private _onElementCreatedStub = stub();
			private _onElementUpdatedStub = stub();
			private _onAttachStub = stub();
			private _onDetachStub = stub();

			constructor() {
				super();
				const instanceData = widgetInstanceMap.get(this)!;
				const stubs: any = {
					nodeHandler: this._nodeHandlerStub,
					onElementCreated: this._onElementCreatedStub,
					onElementUpdated: this._onElementUpdatedStub,
					onAttach: this._onAttachStub,
					onDetach: this._onDetachStub
				};
				meta.setRenderResult = this.setRenderResult;
				meta.nodeHandlerStub = this._nodeHandlerStub;
				meta.onAttachStub = this._onAttachStub;
				meta.onDetachStub = this._onDetachStub;
				meta.invalidate = this.invalidate.bind(this);
				widgetInstanceMap.set(this, { ...instanceData, ...stubs });
			}

			render() {
				if (typeof this._renderResult === 'function') {
					return this._renderResult();
				}
				return this._renderResult;
			}

			public setRenderResult = (renderResult: any) => {
				this._renderResult = renderResult;
				this.invalidate();
			};

			public get nodeHandlerStub() {
				return this._nodeHandlerStub;
			}

			public get onAttachStub() {
				return this._onAttachStub;
			}

			public get onDetachStub() {
				return this._onDetachStub;
			}
		},
		meta
	];
}

class MainBar extends WidgetBase<any> {
	render() {
		return v('span', { innerHTML: 'Bar' });
	}
}

class MainFoo extends WidgetBase<any> {
	render() {
		const { show } = this.properties;
		return v('div', { classes: ['myClass'], foo: 'bar' }, [
			v('h1', { classes: ['myClass'], key: 'one' }, ['Hello Widget']),
			show ? w(MainBar, { classes: ['myClass'], key: 'first' }) : null,
			show ? w(MainBar, { key: 'second' }) : null,
			show ? null : v('div', { key: 'three' }, ['me']),
			`text node`,
			v('h1', { key: 'two', classes: ['myClass'], innerHTML: 'span' })
		]);
	}
}

class TestWidget extends WidgetBase<any> {
	render() {
		return v('span', { classes: ['myClass'] }, [w(MainFoo, { show: this.properties.show })]);
	}
}

let consoleWarnStub: SinonStub;

jsdomDescribe('vdom', () => {
	const spys: SinonSpy[] = [];

	beforeEach(() => {
		resolvers.stub();
		add('dojo-debug', true, true);
		consoleWarnStub = stub(console, 'warn');
	});

	afterEach(() => {
		resolvers.restore();
		for (let spy of spys) {
			spy.restore();
		}
		spys.length = 0;
		consoleWarnStub.restore();
	});

	describe('widgets', () => {
		it('Should render nodes in the correct order with mix of vnode and wnodes', () => {
			class WidgetOne extends WidgetBase {
				render() {
					return w(WidgetTwo, {});
				}
			}

			class WidgetTwo extends WidgetBase {
				render() {
					return v('div', ['dom2']);
				}
			}

			class WidgetThree extends WidgetBase {
				render() {
					return ['dom3', 'dom3a'];
				}
			}

			class WidgetFour extends WidgetBase {
				render() {
					return w(WidgetFive, {});
				}
			}

			class WidgetFive extends WidgetBase {
				render() {
					return w(WidgetSix, {});
				}
			}

			class WidgetSix extends WidgetBase {
				render() {
					return 'dom5';
				}
			}

			class Parent extends WidgetBase {
				render() {
					return ['dom1', w(WidgetOne, {}), w(WidgetThree, {}), 'dom4', w(WidgetFour, {}), 'dom6'];
				}
			}

			const r = renderer(() => w(Parent, {}));
			const root: any = document.createElement('div');
			r.mount({ domNode: root });
			assert.strictEqual(root.childNodes[0].data, 'dom1');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'dom2');
			assert.strictEqual(root.childNodes[2].data, 'dom3');
			assert.strictEqual(root.childNodes[3].data, 'dom3a');
			assert.strictEqual(root.childNodes[4].data, 'dom4');
			assert.strictEqual(root.childNodes[5].data, 'dom5');
			assert.strictEqual(root.childNodes[6].data, 'dom6');
		});

		it('should create elements for widgets', () => {
			const r = renderer(() => w(TestWidget, { show: true }));
			const root = document.createElement('div');
			r.mount({ domNode: root });
			const span = (root.childNodes[0] as Element) as HTMLSpanElement;
			assert.lengthOf(span.childNodes, 1);
			const div = span.childNodes[0] as HTMLDivElement;
			assert.lengthOf(div.childNodes, 5);
			assert.strictEqual(div.getAttribute('foo'), 'bar');

			const headerOne = div.childNodes[0] as HTMLHeadElement;
			const spanOne = div.childNodes[1] as HTMLSpanElement;
			const spanTwo = div.childNodes[2] as HTMLSpanElement;
			const text = div.childNodes[3] as Text;
			const headerTwo = div.childNodes[4] as HTMLHeadElement;

			assert.lengthOf(headerOne.childNodes, 1);
			assert.strictEqual((headerOne.childNodes[0] as Text).data, 'Hello Widget');

			assert.lengthOf(spanOne.childNodes, 1);
			assert.strictEqual(spanOne.innerHTML, 'Bar');

			assert.lengthOf(spanTwo.childNodes, 1);
			assert.strictEqual(spanTwo.innerHTML, 'Bar');

			assert.strictEqual(text.data, 'text node');

			assert.lengthOf(headerTwo.childNodes, 1);
			assert.strictEqual(headerTwo.innerHTML, 'span');
		});

		it('invalidates up the widget tree', () => {
			class Foo extends WidgetBase {
				private _id = 0;

				private _onClick() {
					this._id++;
					this.invalidate();
				}

				render() {
					return v('div', { onclick: this._onClick }, [`${this._id}`]);
				}
			}

			class Bar extends WidgetBase {
				render() {
					return v('div', [w(Foo, { key: '1' }), w(Foo, { key: '2' })]);
				}
			}

			class Baz extends WidgetBase {
				render() {
					return v('div', [w(Bar, {})]);
				}
			}

			const div = document.createElement('div');
			const r = renderer(() => w(Baz, {}));
			r.mount({ domNode: div, sync: true });

			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 1);
			const barDiv = root.childNodes[0];
			assert.lengthOf(barDiv.childNodes, 2);
			const fooOneDiv = barDiv.childNodes[0] as HTMLDivElement;
			const fooTwoDiv = barDiv.childNodes[1] as HTMLDivElement;
			assert.lengthOf(fooOneDiv.childNodes, 1);
			assert.lengthOf(fooTwoDiv.childNodes, 1);
			const fooOneTextNode = fooOneDiv.childNodes[0] as Text;
			const fooTwoTextNode = fooTwoDiv.childNodes[0] as Text;
			assert.strictEqual(fooOneTextNode.data, '0');
			assert.strictEqual(fooTwoTextNode.data, '0');

			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0], barDiv);
			assert.lengthOf(barDiv.childNodes, 2);
			assert.strictEqual(barDiv.childNodes[0], fooOneDiv);
			assert.strictEqual(barDiv.childNodes[1], fooTwoDiv);
			assert.lengthOf(fooOneDiv.childNodes, 1);
			assert.lengthOf(fooTwoDiv.childNodes, 1);
			assert.strictEqual(fooOneDiv.childNodes[0], fooOneTextNode);
			assert.strictEqual(fooTwoDiv.childNodes[0], fooTwoTextNode);
			assert.strictEqual(fooOneTextNode.data, '0');
			assert.strictEqual(fooTwoTextNode.data, '0');

			sendEvent(fooOneDiv, 'click');

			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0], barDiv);
			assert.lengthOf(barDiv.childNodes, 2);
			assert.strictEqual(barDiv.childNodes[0], fooOneDiv);
			assert.strictEqual(barDiv.childNodes[1], fooTwoDiv);
			assert.lengthOf(fooOneDiv.childNodes, 1);
			assert.lengthOf(fooTwoDiv.childNodes, 1);
			assert.notStrictEqual(fooOneDiv.childNodes[0], fooOneTextNode);
			assert.strictEqual(fooTwoDiv.childNodes[0], fooTwoTextNode);
			const updatedFooOneTextNode = fooOneDiv.childNodes[0] as Text;
			assert.strictEqual(updatedFooOneTextNode.data, '1');

			sendEvent(fooTwoDiv, 'click');

			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0], barDiv);
			assert.lengthOf(barDiv.childNodes, 2);
			assert.strictEqual(barDiv.childNodes[0], fooOneDiv);
			assert.strictEqual(barDiv.childNodes[1], fooTwoDiv);
			assert.lengthOf(fooOneDiv.childNodes, 1);
			assert.lengthOf(fooTwoDiv.childNodes, 1);
			assert.strictEqual(fooOneDiv.childNodes[0], updatedFooOneTextNode);
			assert.notStrictEqual(fooTwoDiv.childNodes[0], fooTwoTextNode);
			const updatedFooTwoTextNode = fooTwoDiv.childNodes[0] as Text;
			assert.strictEqual(updatedFooTwoTextNode.data, '1');
			sendEvent(fooOneDiv, 'click');

			assert.strictEqual((fooOneDiv.childNodes[0] as Text).data, '2');
		});

		it('DNodes are bound to the parent widget', () => {
			class Foo extends WidgetBase<any> {
				render() {
					return v('div', { onclick: this.properties.onClick }, this.children);
				}
			}

			class Bar extends WidgetBase<any> {
				render() {
					return v('div', { onclick: this.properties.onClick });
				}
			}
			let clickerCount = 0;
			class App extends WidgetBase {
				_onClick() {
					clickerCount++;
				}

				render() {
					return v('div', { onclick: this._onClick }, [
						w(Foo, { onClick: this._onClick }, [
							v('div', { onclick: this._onClick }, [
								w(Bar, {
									onClick: this._onClick
								})
							])
						])
					]);
				}
			}

			const div = document.createElement('div');
			const r = renderer(() => w(App, {}));
			r.mount({ domNode: div, sync: true });
			sendEvent(div.childNodes[0] as any, 'click', { eventInit: { bubbles: false } });
			sendEvent(div.childNodes[0].childNodes[0] as any, 'click', { eventInit: { bubbles: false } });
			sendEvent(div.childNodes[0].childNodes[0].childNodes[0] as any, 'click', {
				eventInit: { bubbles: false }
			});
			sendEvent(div.childNodes[0].childNodes[0].childNodes[0].childNodes[0] as any, 'click', {
				eventInit: { bubbles: false }
			});
			assert.strictEqual(clickerCount, 4);
		});

		it('Should render async widgets in the correct order', () => {
			let invalidateFoo = () => {};
			let invalidateBar = () => {};
			class Foo extends WidgetBase {
				doRender = 0;

				constructor() {
					super();
					invalidateFoo = () => {
						this.doRender++;
						this.invalidate();
					};
				}

				render() {
					return this.doRender > 0 ? v('foo', ['foo']) : null;
				}
			}

			class Bar extends WidgetBase {
				doRender = 0;

				constructor() {
					super();
					invalidateBar = () => {
						this.doRender++;
						this.invalidate();
					};
				}

				render() {
					return this.doRender > 0 ? v('bar', [this.doRender > 1 ? 'bar' : null]) : null;
				}
			}

			class App extends WidgetBase {
				render() {
					return v('div', [w(Foo, {}), w(Bar, {})]);
				}
			}

			const r = renderer(() => w(App, {}));
			const div = document.createElement('app');
			r.mount({ domNode: div });
			invalidateFoo();
			invalidateBar();
			resolvers.resolve();
			assert.strictEqual(div.outerHTML, '<app><div><foo>foo</foo><bar></bar></div></app>');
			invalidateBar();
			resolvers.resolve();
			assert.strictEqual(div.outerHTML, '<app><div><foo>foo</foo><bar>bar</bar></div></app>');
		});

		it('supports widget registry items', () => {
			const registry = new Registry();
			class Foo extends WidgetBase<any> {
				render() {
					return v('h1', [this.properties.text]);
				}
			}
			class Bar extends WidgetBase<any> {
				render() {
					return v('h2', [this.properties.text]);
				}
			}

			registry.define('foo', Foo);
			registry.define('bar', Bar);
			class Baz extends WidgetBase {
				render() {
					return v('div', [w<Foo>('foo', { text: 'foo' }), w<Bar>('bar', { text: 'bar' })]);
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true, registry });
			const root = div.childNodes[0];
			const headerOne = root.childNodes[0];
			const headerOneText = headerOne.childNodes[0] as Text;
			const headerTwo = root.childNodes[1];
			const headerTwoText = headerTwo.childNodes[0] as Text;
			assert.strictEqual(headerOneText.data, 'foo');
			assert.strictEqual(headerTwoText.data, 'bar');
		});

		it('support top level registry items', () => {
			const registry = new Registry();
			class Foo extends WidgetBase {
				render() {
					return 'Top Level Registry';
				}
			}

			let resolver: any;
			const promise = new Promise<any>((resolve) => {
				resolver = resolve;
			});

			const r = renderer(() =>
				w(
					{
						label: 'foo',
						registryItem: () => {
							return promise;
						}
					},
					{}
				)
			);
			const div = document.createElement('div');
			r.mount({ domNode: div, registry, sync: true });
			resolver(Foo);
			assert.strictEqual(div.outerHTML, '<div></div>');
			return promise.then(() => {
				assert.strictEqual(div.outerHTML, '<div>Top Level Registry</div>');
			});
		});

		it('Should pause rendering while merging to allow lazily loaded widgets to be loaded', () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			iframe.contentDocument!.write(`<div><span>54321</span><span>98765</span><span>12345</span></div>`);
			iframe.contentDocument!.close();

			const root = iframe.contentDocument!.body.firstChild as HTMLElement;
			const lazyFooSpan = root.childNodes[0] as HTMLSpanElement;
			const lazyBarSpan = root.childNodes[1] as HTMLSpanElement;
			const span = root.childNodes[2] as HTMLSpanElement;
			const registry = new Registry();

			class Bar extends WidgetBase {
				render() {
					return v('span', ['98765']);
				}
			}

			let barResolver: any;
			const barPromise = new Promise<any>((resolve) => {
				barResolver = resolve;
			});

			class Foo extends WidgetBase {
				render() {
					return [v('span', ['54321']), w({ label: 'bar', registryItem: () => barPromise }, {})];
				}
			}

			let fooResolver: any;
			const fooPromise = new Promise<any>((resolve) => {
				fooResolver = resolve;
			});

			class App extends WidgetBase {
				render() {
					return v('div', [
						w(
							{
								label: 'foo',
								registryItem: () => fooPromise
							},
							{}
						),
						v('span', ['12345'])
					]);
				}
			}

			const r = renderer(() => w(App, {}));
			r.mount({ registry, domNode: iframe.contentDocument!.body, sync: true });
			fooResolver(Foo);
			return fooPromise.then(() => {
				assert.strictEqual(root.childNodes[2], span);
				assert.strictEqual(root.childNodes[1], lazyBarSpan);
				assert.strictEqual(root.childNodes[0], lazyFooSpan);
				barResolver(Bar);
				return barPromise.then(() => {
					assert.strictEqual(root.childNodes[2], span);
					assert.strictEqual(root.childNodes[1], lazyBarSpan);
					assert.strictEqual(root.childNodes[0], lazyFooSpan);
				});
			});
		});

		it('registry items', () => {
			let resolver = () => {};
			const registry = new Registry();
			class Widget extends WidgetBase {
				render() {
					return v('div', ['Hello, world!']);
				}
			}
			class RegistryWidget extends WidgetBase {
				render() {
					return v('div', ['Registry, world!']);
				}
			}
			const promise = new Promise<any>((resolve) => {
				resolver = () => {
					resolve(RegistryWidget);
				};
			});
			registry.define('registry-item', promise);
			class App extends WidgetBase {
				render() {
					return [w('registry-item', {}), w(Widget, {})];
				}
			}
			const r = renderer(() => w(App, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true, registry });
			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'Hello, world!');
			resolver();
			return promise.then(() => {
				assert.lengthOf(root.childNodes, 2);
				assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'Registry, world!');
				assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'Hello, world!');
			});
		});

		it('Should warn when removing nodes that are not distinguishable', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderResult = v('div', [v('div'), v('div')]);

				renderTwo = v('div', [v('div')]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.calledOnce);
		});

		it('Should warn when removing widgets that are not distinguishable', () => {
			class Bar extends WidgetBase {}
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderResult = v('div', [w(Bar, {}), w(Bar, {})]);

				renderTwo = v('div', [w(Bar, {})]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.calledOnce);
		});

		it('Should warn when adding nodes that are not distinguishable', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderTwo = v('div', [v('div'), v('div')]);

				renderResult = v('div', [v('div')]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.calledOnce);
		});

		it('Should warn when adding widgets that are not distinguishable', () => {
			class Bar extends WidgetBase {}
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderTwo = v('div', [w(Bar, {}), w(Bar, {})]);

				renderResult = v('div', [w(Bar, {})]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.calledOnce);
		});

		it('Should not warn when removing nodes that are distinguishable', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderResult = v('div', [v('div', { key: '1' }), v('div', { key: '2' })]);

				renderTwo = v('div', [v('div', { key: '1' })]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.notCalled);
		});

		it('Should not warn when removing widgets that are distinguishable', () => {
			class Bar extends WidgetBase {}
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderResult = v('div', [w(Bar, { key: '1' }), w(Bar, { key: '2' })]);

				renderTwo = v('div', [w(Bar, { key: '1' })]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.notCalled);
		});

		it('Should not warn when adding nodes that are distinguishable', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderTwo = v('div', [v('div', { key: '1' }), v('div', { key: '2' })]);

				renderResult = v('div', [v('div', { key: '1' })]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.notCalled);
		});

		it('Should not warn when adding widgets that are distinguishable', () => {
			class Bar extends WidgetBase {}
			let invalidate: any;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				renderTwo = v('div', [w(Bar, { key: '1' }), w(Bar, { key: '2' })]);

				renderResult = v('div', [w(Bar, { key: '1' })]);

				invalidate() {
					this.renderResult = this.renderTwo;
					super.invalidate();
				}

				render() {
					return this.renderResult;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.isTrue(consoleWarnStub.notCalled);
			invalidate();
			assert.isTrue(consoleWarnStub.notCalled);
		});

		it('should invalidate when a registry items is loaded', () => {
			const registry = new Registry();

			class Foo extends WidgetBase<any> {
				render() {
					return v('h1', [this.properties.text]);
				}
				invalidate() {
					super.invalidate();
				}
			}
			class Bar extends WidgetBase<any> {
				render() {
					return v('h2', [this.properties.text]);
				}
				invalidate() {
					super.invalidate();
				}
			}

			class Baz extends WidgetBase {
				render() {
					return v('div', [w<Foo>('foo', { text: 'foo' }), w<Bar>('bar', { text: 'bar' })]);
				}
				invalidate() {
					super.invalidate();
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true, registry });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 0);
			registry.define('foo', Foo);
			registry.define('bar', Bar);

			const headerOne = root.childNodes[0];
			const headerOneText = headerOne.childNodes[0] as Text;
			const headerTwo = root.childNodes[1];
			const headerTwoText = headerTwo.childNodes[0] as Text;
			assert.strictEqual(headerOneText.data, 'foo');
			assert.strictEqual(headerTwoText.data, 'bar');
		});

		it('scopes registry to the widget that the WNode is defined', () => {
			class Foo extends WidgetBase {
				render() {
					return this.children;
				}
			}

			class Bar extends WidgetBase {
				render() {
					return 'BAR';
				}
			}

			@registry('bar', Bar)
			class Qux extends WidgetBase {
				render() {
					return v('div', [w(Foo, {}, [w('bar', {})])]);
				}
			}

			const r = renderer(() => w(Qux, {}));
			const div: any = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(div.childNodes[0].childNodes[0].data, 'BAR');
		});

		it('supports an array of DNodes', () => {
			class Foo extends WidgetBase {
				private myClass = false;

				render() {
					this.myClass = !this.myClass;
					const classes = this.myClass ? ['myClass'] : [];

					return [
						v('div', { classes }, ['1']),
						v('div', {}, ['2']),
						v('div', { classes: ['myClass'] }, ['3'])
					];
				}
			}

			class Bar extends WidgetBase {
				render() {
					return v('div', [w(Foo, {})]);
				}
			}

			const r = renderer(() => w(Bar, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 3);
			const childOne = root.childNodes[0];
			assert.lengthOf(childOne.childNodes, 1);
			const textNodeOne = childOne.childNodes[0] as Text;
			assert.strictEqual(textNodeOne.data, '1');
			const childTwo = root.childNodes[1];
			assert.lengthOf(childTwo.childNodes, 1);
			const textNodeTwo = childTwo.childNodes[0] as Text;
			assert.strictEqual(textNodeTwo.data, '2');
			const childThree = root.childNodes[2];
			assert.lengthOf(childThree.childNodes, 1);
			const textNodeThree = childThree.childNodes[0] as Text;
			assert.strictEqual(textNodeThree.data, '3');
		});

		it('supports null, undefined and false return from render', () => {
			class Foo extends WidgetBase {
				render() {
					return null;
				}
			}

			class Bar extends WidgetBase {
				render() {
					return undefined;
				}
			}

			class Qux extends WidgetBase {
				render() {
					return false;
				}
			}

			class Baz extends WidgetBase {
				render() {
					return v('div', [w(Foo, {}), w(Bar, {}), w(Qux, {})]);
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 0);
		});

		it('supports null return from render and subsequent return on re-render', () => {
			let fooInvalidate: any;
			class Foo extends WidgetBase<any> {
				private myClass = false;

				constructor() {
					super();
					fooInvalidate = this.invalidate.bind(this);
				}

				render() {
					if (!this.properties.show) {
						return null;
					}
					this.myClass = !this.myClass;
					const classes = this.myClass ? ['myClass'] : [];
					return v('div', { key: '1', classes }, ['content']);
				}
			}

			let show: any;
			class Baz extends WidgetBase {
				private _show = false;

				constructor() {
					super();
					show = this.show.bind(this);
				}

				show(value: boolean) {
					this._show = value;
					this.invalidate();
				}

				render() {
					return v('div', [w(Foo, { show: this._show })]);
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 0);
			show(true);

			assert.lengthOf(root.childNodes, 1);
			const fooDiv = root.childNodes[0] as HTMLDivElement;
			assert.lengthOf(fooDiv.classList, 1);
			assert.lengthOf(fooDiv.childNodes, 1);
			const fooDivContent = fooDiv.childNodes[0] as Text;
			assert.strictEqual(fooDivContent.data, 'content');
			fooInvalidate();

			assert.lengthOf(fooDiv.classList, 0);
			assert.lengthOf(fooDiv.childNodes, 1);
		});

		it('Should insert children in the correct position when returned from a nested tree of virtual widgets', () => {
			class Test extends WidgetBase {
				render() {
					return v('div', this.children);
				}
			}

			@alwaysRender()
			class Renderer extends WidgetBase<any> {
				render() {
					return this.properties.renderer();
				}
			}

			let showA: any;
			let showB: any;
			let showAll: any;
			class App extends WidgetBase {
				private _showA = true;
				private _showB = true;

				constructor() {
					super();
					showAll = () => {
						this._showA = true;
						this._showB = true;
						this.invalidate();
					};
					showA = () => {
						this._showA = true;
						this._showB = false;
						this.invalidate();
					};
					showB = () => {
						this._showA = false;
						this._showB = true;
						this.invalidate();
					};
				}

				protected render() {
					return v('div', [
						v('div', [
							w(Renderer, {
								renderer: () => {
									return this._showA && w(Test, {}, ['a']);
								}
							}),
							w(Renderer, {
								renderer: () => {
									return this._showB && w(Test, {}, ['b']);
								}
							})
						])
					]);
				}
			}

			const r = renderer(() => w(App, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root: any = div.childNodes[0] as Element;
			assert.strictEqual(root.innerHTML, '<div><div>a</div><div>b</div></div>');
			showA();
			assert.strictEqual(root.innerHTML, '<div><div>a</div></div>');
			showB();
			assert.strictEqual(root.innerHTML, '<div><div>b</div></div>');
			showAll();
			assert.strictEqual(root.innerHTML, '<div><div>a</div><div>b</div></div>');
		});

		it('Should insert nodes at correct position the previous widget returned null', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', ['foo']);
				}
			}

			class Bar extends WidgetBase {
				render() {
					return v('div', ['bar']);
				}
			}

			let changeWidget: any;
			class Baz extends WidgetBase<any> {
				private _widget = 'default';
				constructor() {
					super();
					changeWidget = (widget: string) => {
						this._widget = widget;
						this.invalidate();
					};
				}
				render() {
					return v('div', [
						v('div', { key: '1' }, ['first']),
						w(this._widget, { key: '2' }),
						w(this._widget, { key: '3' }),
						v('div', { key: '4' }, ['second']),
						w(this._widget, { key: '5' })
					]);
				}
			}

			const registry = new Registry();
			registry.define('foo', Foo);
			registry.define('bar', Bar);

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true, registry });
			const root: any = div.childNodes[0] as Element;
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'second');
			changeWidget('other');
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'second');
			changeWidget('foo');
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'foo');
			assert.strictEqual(root.childNodes[2].childNodes[0].data, 'foo');
			assert.strictEqual(root.childNodes[3].childNodes[0].data, 'second');
			assert.strictEqual(root.childNodes[4].childNodes[0].data, 'foo');
			changeWidget('bar');
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'bar');
			assert.strictEqual(root.childNodes[2].childNodes[0].data, 'bar');
			assert.strictEqual(root.childNodes[3].childNodes[0].data, 'second');
			assert.strictEqual(root.childNodes[4].childNodes[0].data, 'bar');
			changeWidget('other');
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'second');
			changeWidget('bar');
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'first');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'bar');
			assert.strictEqual(root.childNodes[2].childNodes[0].data, 'bar');
			assert.strictEqual(root.childNodes[3].childNodes[0].data, 'second');
			assert.strictEqual(root.childNodes[4].childNodes[0].data, 'bar');
		});

		it('should only insert before nodes that are not orphaned', () => {
			let swap: Function;
			class Parent extends WidgetBase {
				private items: DNode[] = [w(ChildOne, {}), w(ChildTwo, {})];
				render() {
					return v('div', this.items);
				}

				swap() {
					this.items = [w(ChildThree, {})];
					this.invalidate();
				}

				constructor() {
					super();
					swap = this.swap.bind(this);
				}
			}

			let hideOne: Function;
			class ChildOne extends WidgetBase {
				private _show = true;

				render() {
					return this._show ? w(Widget, { num: 1 }) : null;
				}

				hide() {
					this._show = false;
					this.invalidate();
				}

				constructor() {
					super();
					hideOne = this.hide.bind(this);
				}
			}

			let hideTwo: Function;
			class ChildTwo extends WidgetBase {
				private _show = true;

				render() {
					return this._show ? w(Widget, { num: 2 }) : null;
				}

				hide() {
					this._show = false;
					this.invalidate();
				}

				constructor() {
					super();
					hideTwo = this.hide.bind(this);
				}
			}

			class ChildThree extends WidgetBase {
				render() {
					return w(Widget, { num: 3 });
				}
			}

			class Widget extends WidgetBase<any> {
				render() {
					return v('div', [`hello ${this.properties.num}`]);
				}
			}

			const r = renderer(() => w(Parent, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root: any = div.childNodes[0] as Element;
			hideOne!();
			hideTwo!();
			swap!();
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'hello 3');
		});

		it('Should insert the new DOM node before the existing node', () => {
			let invalidate: any;

			class App extends WidgetBase {
				private isBig = false;

				constructor() {
					super();
					invalidate = this.goBig.bind(this);
				}

				goBig() {
					this.isBig = !this.isBig;
					this.invalidate();
				}

				protected render() {
					return v('div', { key: 'root' }, [this.isBig ? v('h1', ['First']) : null, v('h2', ['Second'])]);
				}
			}

			const r = renderer(() => w(App, {}));
			const root: any = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			assert.lengthOf(root.childNodes[0].childNodes, 1);
			assert.strictEqual((root.childNodes[0].childNodes[0].childNodes[0] as Text).data, 'Second');
			invalidate();
			assert.lengthOf(root.childNodes[0].childNodes, 2);
			assert.strictEqual((root.childNodes[0].childNodes[0].childNodes[0] as Text).data, 'First');
			assert.strictEqual((root.childNodes[0].childNodes[1].childNodes[0] as Text).data, 'Second');
		});

		it('Should insert sibling DOM nodes in the correct order with a mixture of vnodes and wnodes returns an array', () => {
			class GrandParent extends WidgetBase {
				render() {
					return v('div', [w(Parent, {}), w(ChildOne, {}), v('div', ['insert before me'])]);
				}
			}

			class Parent extends WidgetBase {
				render() {
					return [w(ChildOne, { key: '1' }), w(ChildOne, { key: '2' })];
				}
			}

			class ChildOne extends WidgetBase {
				render() {
					return w(ChildTwo, {});
				}
			}

			class ChildTwo extends WidgetBase {
				render() {
					return v('div', ['Two']);
				}
			}

			const r = renderer(() => w(GrandParent, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			const root: any = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 4);
		});

		it('should only insert before nodes that are not orphaned when returning from an array', () => {
			class VeryParent extends WidgetBase {
				render() {
					return v('div', [w(Parent, {}), w(ChildOne, {}), v('div', ['insert before me'])]);
				}
			}

			let parentInvalidate: any;
			class Parent extends WidgetBase {
				private items: DNode[] = [w(ChildOne, { key: '1' }), w(ChildOne, { key: '2' })];
				constructor() {
					super();
					parentInvalidate = this.swap.bind(this);
				}
				render() {
					return this.items;
				}

				swap() {
					this.items = [w(ChildOne, { key: '1' }), w(ChildOne, { key: '2' }), v('div', ['New'])];
					this.invalidate();
				}
			}

			let hide = false;
			class ChildOne extends WidgetBase {
				render() {
					return w(ChildTwo, {});
				}
			}

			let invalidateTwo: any[] = [];
			class ChildTwo extends WidgetBase {
				constructor() {
					super();
					invalidateTwo.push(this.invalidate.bind(this));
				}
				render() {
					return hide ? null : v('div', ['Two']);
				}
			}

			const r = renderer(() => w(VeryParent, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			const root: any = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 4);
			invalidateTwo.forEach((invalidate) => invalidate());
			resolvers.resolve();
			assert.lengthOf(root.childNodes, 4);
			hide = true;
			invalidateTwo.forEach((invalidate) => invalidate());
			resolvers.resolve();
			assert.lengthOf(root.childNodes, 1);
			parentInvalidate();
			resolvers.resolve();
			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual(root.childNodes[0].childNodes[0].data, 'New');
			assert.strictEqual(root.childNodes[1].childNodes[0].data, 'insert before me');
		});

		it('Should insert result from widget in correct position', () => {
			class Menu extends WidgetBase {
				render() {
					return 'Menu';
				}
			}
			class View extends WidgetBase {
				render() {
					return 'View';
				}
			}

			let switcher: any;
			class App extends WidgetBase {
				private _show = true;

				private switcher = () => {
					this._show = !this._show;
					this.invalidate();
				};

				constructor() {
					super();
					switcher = this.switcher;
				}

				render() {
					return v('div', [this._show ? w(Menu, {}) : null, v('div', [this._show ? w(View, {}) : null])]);
				}
			}

			const r = renderer(() => w(App, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(div.outerHTML, '<div><div>Menu<div>View</div></div></div>');
			switcher();
			assert.strictEqual(div.outerHTML, '<div><div><div></div></div></div>');
			switcher();
			assert.strictEqual(div.outerHTML, '<div><div>Menu<div>View</div></div></div>');
		});

		it('Should not render widgets that have been detached', () => {
			let switcher: any;
			class ChildOne extends WidgetBase {
				render() {
					return 'Child One';
				}
			}

			let childTwoInvalidate: Function;
			let renderResult: DNode = null;
			class ChildTwo extends WidgetBase {
				constructor() {
					super();
					childTwoInvalidate = this.invalidate.bind(this);
				}

				render() {
					return renderResult;
				}
			}

			class Parent extends WidgetBase {
				private _items: any[] = [w(ChildTwo, {})];

				constructor() {
					super();
					switcher = this.switch.bind(this);
				}
				render() {
					return v('main', this._items);
				}

				switch() {
					this._items = [w(ChildOne, {})];
					this.invalidate();
				}
			}

			const r = renderer(() => w(Parent, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			renderResult = v('span', ['me']);
			childTwoInvalidate!();
			switcher();
			childTwoInvalidate!();
			assert.lengthOf(div.childNodes[0]!.childNodes, 1);
			assert.strictEqual((div.childNodes[0]!.childNodes[0] as Text).data, 'Child One');
		});

		it('should always use the latest wrapper when processing removed nodes', () => {
			let invalidateFoo: any;
			let fooRenderCount = 0;
			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidateFoo = () => {
						this.invalidate();
					};
				}
				render() {
					fooRenderCount++;
					return 'Foo';
				}
			}

			let switchFoo: any;
			class Bar extends WidgetBase {
				private _showFoo = false;
				constructor() {
					super();
					switchFoo = () => {
						this._showFoo = !this._showFoo;
						this.invalidate();
					};
				}
				render() {
					return v('div', [v('div', [!this._showFoo ? v('div') : w(Foo, {})])]);
				}
			}

			let showApp: any;
			class App extends WidgetBase {
				private _showApp = true;
				constructor() {
					super();
					showApp = () => {
						this._showApp = !this._showApp;
						this.invalidate();
					};
				}
				render() {
					return this._showApp ? v('div', [w(Bar, {})]) : null;
				}
			}

			const div = document.createElement('div');
			const r = renderer(() => w(App, {}));
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(fooRenderCount, 0);
			switchFoo();
			assert.strictEqual(fooRenderCount, 1);
			showApp();
			invalidateFoo();
			assert.strictEqual(fooRenderCount, 1);
		});

		it('should allow a widget returned from render', () => {
			class Bar extends WidgetBase<any> {
				render() {
					return v('div', [`Hello, ${this.properties.foo}!`]);
				}
			}

			class Baz extends WidgetBase<any> {
				render() {
					return w(Bar, { foo: 'foo' });
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 1);
			let textNodeOne = root.childNodes[0] as Text;
			assert.strictEqual(textNodeOne.data, 'Hello, foo!');
		});

		it('should create nodes for an array returned from the top level via a widget', () => {
			class Foo extends WidgetBase {
				render() {
					return [v('div', ['1']), v('div', ['2']), v('div', ['3'])];
				}
			}

			class Bar extends WidgetBase {
				render() {
					return w(Foo, {});
				}
			}

			const r = renderer(() => w(Bar, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div;
			assert.lengthOf(root.childNodes, 3);
			const firstTextNodeChild = root.childNodes[0].childNodes[0] as Text;
			const secondTextNodeChild = root.childNodes[1].childNodes[0] as Text;
			const thirdTextNodeChild = root.childNodes[2].childNodes[0] as Text;
			assert.strictEqual(firstTextNodeChild.data, '1');
			assert.strictEqual(secondTextNodeChild.data, '2');
			assert.strictEqual(thirdTextNodeChild.data, '3');
		});

		it('should find node in array of siblings', () => {
			let expand: any;
			class Foo extends WidgetBase<any> {
				private _expand = false;

				doExpand() {
					this._expand = !this._expand;
					this.invalidate();
				}

				render() {
					return this._expand
						? [v('div', { key: '1' }, ['one']), v('div', { key: '2' }, ['two'])]
						: [v('div', { key: '1' }, ['one'])];
				}
			}

			class EnhancedFoo extends Foo {
				constructor() {
					super();
					expand = this.doExpand.bind(this);
				}
			}

			class Parent extends WidgetBase {
				render() {
					return v('div', [w(EnhancedFoo, {}), w(Foo, {})]);
				}
			}

			const r = renderer(() => w(Parent, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0];
			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'one');
			expand();
			assert.lengthOf(root.childNodes, 3);
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'one');
			expand();
			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'one');
			expand();
			assert.lengthOf(root.childNodes, 3);
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'one');
		});

		it('only pass siblings if the node found exists in the list', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', [v('div', { key: '3' }, ['one']), v('div', { key: '3' }, ['two']), w(Bar, {})]);
				}
			}
			let showBar = false;
			let invalidateBar: any;
			class Bar extends WidgetBase {
				constructor() {
					super();
					invalidateBar = this.invalidate.bind(this);
				}
				render() {
					return showBar ? [v('div', { key: '3' }, ['three']), w(Qux, {})] : null;
				}
			}

			let showQux = false;
			let invalidateQux: any;
			class Qux extends WidgetBase {
				constructor() {
					super();
					invalidateQux = this.invalidate.bind(this);
				}
				render() {
					return showQux ? v('div', { key: '3' }, ['four']) : null;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0];
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			showBar = true;
			invalidateBar();
			showQux = true;
			invalidateQux();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'three');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, 'four');
		});

		it('Should insert a new DNode at the beginning when returning an array in the correct position', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', [v('div', { key: '1' }, ['one']), v('div', { key: '2' }, ['two']), w(Bar, {})]);
				}
			}
			let showBar = false;
			let invalidateBar: any;
			class Bar extends WidgetBase {
				constructor() {
					super();
					invalidateBar = this.invalidate.bind(this);
				}
				render() {
					return showBar ? [w(Qux, {}), v('div', { key: '3' }, ['three'])] : null;
				}
			}

			let showQux = false;
			let invalidateQux: any;
			class Qux extends WidgetBase {
				constructor() {
					super();
					invalidateQux = this.invalidate.bind(this);
				}
				render() {
					return showQux ? v('div', { key: '4' }, ['four']) : null;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0];
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			showBar = true;
			invalidateBar();
			showQux = true;
			invalidateQux();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'four');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, 'three');
		});

		it('Should insert a new DNode at the middle when returning an array in the correct position', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', [v('div', { key: '1' }, ['one']), v('div', { key: '2' }, ['two']), w(Bar, {})]);
				}
			}
			let showBar = false;
			let invalidateBar: any;
			class Bar extends WidgetBase {
				constructor() {
					super();
					invalidateBar = this.invalidate.bind(this);
				}
				render() {
					return showBar
						? [v('div', { key: '3' }, ['three']), w(Qux, {}), v('div', { key: '5' }, ['five'])]
						: null;
				}
			}

			let showQux = false;
			let invalidateQux: any;
			class Qux extends WidgetBase {
				constructor() {
					super();
					invalidateQux = this.invalidate.bind(this);
				}
				render() {
					return showQux ? v('div', { key: '4' }, ['four']) : null;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0];
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			showBar = true;
			invalidateBar();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'three');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, 'five');
			showQux = true;
			invalidateQux();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'one');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'two');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'three');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, 'four');
			assert.strictEqual((root.childNodes[4].childNodes[0] as Text).data, 'five');
		});

		it('Should only try to insert before nodes that share the same parent', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				private _show = false;

				constructor() {
					super();
					invalidate = this.show;
				}

				public show = () => {
					this._show = !this._show;
					this.invalidate();
				};

				render() {
					return v('div', {}, [v('h2', this._show ? [v('a', ['link'])] : []), v('p', ['Hello'])]);
				}
			}

			class App extends WidgetBase {
				render() {
					return v('div', [w(Foo, {})]);
				}
			}

			const r = renderer(() => w(App, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div;
			const h2 = root.childNodes[0].childNodes[0].childNodes[0];
			const p = root.childNodes[0].childNodes[0].childNodes[1];
			assert.lengthOf(h2.childNodes, 0);
			assert.lengthOf(p.childNodes, 1);
			assert.strictEqual((p.childNodes[0] as Text).data, 'Hello');
			invalidate();
			assert.strictEqual(root.childNodes[0].childNodes[0].childNodes[0], h2);
			assert.strictEqual(root.childNodes[0].childNodes[0].childNodes[1], p);
			assert.lengthOf(h2.childNodes, 1);
			assert.strictEqual((h2.childNodes[0].childNodes[0] as Text).data, 'link');
		});

		it('should update an array of nodes to single node', () => {
			let invalidate: any;
			class Foo extends WidgetBase {
				private _array = false;
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}
				render() {
					this._array = !this._array;
					return this._array
						? [v('div', { key: '1' }, ['1']), v('div', { key: '2' }, ['2']), v('div', { key: '3' }, ['3'])]
						: v('div', { key: '1' }, ['2']);
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div;
			assert.lengthOf(root.childNodes, 3);
			const firstTextNodeChild = root.childNodes[0].childNodes[0] as Text;
			const secondTextNodeChild = root.childNodes[1].childNodes[0] as Text;
			const thirdTextNodeChild = root.childNodes[2].childNodes[0] as Text;
			assert.strictEqual(firstTextNodeChild.data, '1');
			assert.strictEqual(secondTextNodeChild.data, '2');
			assert.strictEqual(thirdTextNodeChild.data, '3');
			invalidate();

			assert.lengthOf(root.childNodes, 1);
			const textNodeChild = root.childNodes[0].childNodes[0] as Text;
			assert.strictEqual(textNodeChild.data, '2');
		});

		it('should only render a sub tree from an invalidation', () => {
			let parentRenderCount = 0;
			let barRenderCount = 0;
			let bazRenderCount = 0;
			let barClicker: () => void = () => {};
			let bazClicker: () => void = () => {};

			class Bar extends WidgetBase {
				private _counter = 0;

				private _onClick = () => {
					this._counter++;
					this.invalidate();
				};

				constructor() {
					super();
					barClicker = this._onClick;
				}

				protected render() {
					barRenderCount++;
					return v('div', [`bar ${this._counter}`]);
				}
			}

			class Baz extends WidgetBase {
				private _counter = 0;

				private _onClick = () => {
					this._counter++;
					this.invalidate();
				};

				constructor() {
					super();
					bazClicker = this._onClick;
				}

				protected render() {
					bazRenderCount++;
					return v('div', [`baz ${this._counter}`]);
				}
			}

			class Foo extends WidgetBase {
				protected render() {
					parentRenderCount++;
					return v('div', [w(Bar, {}), w(Baz, {})]);
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(parentRenderCount, 1);
			assert.strictEqual(barRenderCount, 1);
			assert.strictEqual(bazRenderCount, 1);
			bazClicker();
			resolvers.resolve();
			assert.strictEqual(parentRenderCount, 1);
			assert.strictEqual(barRenderCount, 1);
			assert.strictEqual(bazRenderCount, 2);
			barClicker();
			resolvers.resolve();
			assert.strictEqual(parentRenderCount, 1);
			assert.strictEqual(barRenderCount, 2);
			assert.strictEqual(bazRenderCount, 2);
		});

		it('should append nodes for an array returned from the top level', () => {
			class Foo extends WidgetBase {
				render() {
					return [v('div', ['1']), v('div', ['2']), v('div', ['3'])];
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div;
			assert.lengthOf(root.childNodes, 3);
			const firstTextNodeChild = root.childNodes[0].childNodes[0] as Text;
			const secondTextNodeChild = root.childNodes[1].childNodes[0] as Text;
			const thirdTextNodeChild = root.childNodes[2].childNodes[0] as Text;
			assert.strictEqual(firstTextNodeChild.data, '1');
			assert.strictEqual(secondTextNodeChild.data, '2');
			assert.strictEqual(thirdTextNodeChild.data, '3');
		});

		it('Should insert lazy widgets in the correct position when returning nested widgets', () => {
			let resolver: any;
			const promise = new Promise<any>((resolve) => {
				resolver = resolve;
			});

			class Item extends WidgetBase {
				render() {
					const { key } = this.properties;
					return v('div', [`item-${key}`]);
				}
			}

			class Menu extends WidgetBase {
				render() {
					const { key } = this.properties;
					return w(Item, { key });
				}
			}

			class App extends WidgetBase {
				render() {
					return v('div', [
						w({ label: 'first', registryItem: () => promise }, { key: 'first' }),
						v('div', [w({ label: 'second', registryItem: () => promise }, { key: 'second' })])
					]);
				}
			}

			const r = renderer(() => w(App, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			resolver(Menu);
			return promise.then(() => {
				assert.strictEqual(
					div.outerHTML,
					'<div><div><div>item-first</div><div><div>item-second</div></div></div></div>'
				);
			});
		});

		it('should append nodes for an array returned from the top level via a widget', () => {
			class Foo extends WidgetBase {
				render() {
					return [v('div', ['1']), v('div', ['2']), v('div', ['3'])];
				}
			}

			class Bar extends WidgetBase {
				render() {
					return w(Foo, {});
				}
			}

			const r = renderer(() => w(Bar, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div;
			assert.lengthOf(root.childNodes, 3);
			const firstTextNodeChild = root.childNodes[0].childNodes[0] as Text;
			const secondTextNodeChild = root.childNodes[1].childNodes[0] as Text;
			const thirdTextNodeChild = root.childNodes[2].childNodes[0] as Text;
			assert.strictEqual(firstTextNodeChild.data, '1');
			assert.strictEqual(secondTextNodeChild.data, '2');
			assert.strictEqual(thirdTextNodeChild.data, '3');
		});

		it('Do not break early for the same WNode', () => {
			let selected: any;
			class Foo extends WidgetBase<any> {
				private _selected = 0;
				constructor() {
					super();
					selected = this.selected;
				}

				selected = () => {
					this._selected = 1;
					this.invalidate();
				};
				render() {
					const children = this.children.map((child: any, index: number) => {
						child.properties.selected = this._selected === index;
						return child;
					});

					return v('div', children);
				}
			}

			class Bar extends WidgetBase<any> {
				render() {
					return v('div', [this.properties.selected ? 'selected' : 'not selected']);
				}
			}

			const r = renderer(() => w(Foo, {}, [w(Bar, { key: '1' }), w(Bar, { key: '2' })]));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0];
			assert.lengthOf(root.childNodes, 2);
			let firstTextNode = root.childNodes[0].childNodes[0] as Text;
			let secondTextNode = root.childNodes[1].childNodes[0] as Text;
			assert.strictEqual(firstTextNode.data, 'selected');
			assert.strictEqual(secondTextNode.data, 'not selected');
			selected();
			firstTextNode = root.childNodes[0].childNodes[0] as Text;
			secondTextNode = root.childNodes[1].childNodes[0] as Text;
			assert.strictEqual(firstTextNode.data, 'not selected');
			assert.strictEqual(secondTextNode.data, 'selected');
		});

		it('removes existing widget and uses new widget when widget changes', () => {
			let fooCreated = false;
			let barCreatedCount = 0;
			class Foo extends WidgetBase {
				constructor() {
					super();
					fooCreated = true;
				}

				render() {
					return v('div');
				}
			}

			class Bar extends WidgetBase {
				constructor() {
					super();
					barCreatedCount++;
				}

				render() {
					return v('span');
				}
			}

			let foo: any;
			class Baz extends WidgetBase {
				private _foo = true;

				constructor() {
					super();
					foo = this.foo;
				}

				foo = (value: boolean) => {
					this._foo = value;
					this.invalidate();
				};

				render() {
					return v('div', [
						this._foo ? w(Foo, {}) : w(Bar, {}),
						this._foo ? w(Bar, { key: '1' }) : w(Bar, { key: '2' })
					]);
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolve();
			assert.isTrue(fooCreated);
			foo(false);
			resolvers.resolve();
			assert.strictEqual(barCreatedCount, 3);
		});

		it('calls onAttach when widget is rendered', () => {
			let onAttachCallCount = 0;
			let invalidate: any;
			class Bar extends WidgetBase {
				onAttach() {
					onAttachCallCount++;
				}

				render() {
					return [v('div')];
				}
			}

			class Foo extends WidgetBase {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				onAttach() {
					onAttachCallCount++;
				}

				render() {
					return w(Bar, {});
				}
			}
			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolve();
			assert.strictEqual(onAttachCallCount, 2);
			invalidate();
			resolvers.resolve();
			assert.strictEqual(onAttachCallCount, 2);
		});

		it('calls onDetach when widget is removed', () => {
			let fooAttachCount = 0;
			let fooDetachCount = 0;
			let barAttachCount = 0;
			let barDetachCount = 0;
			let bazAttachCount = 0;
			let bazDetachCount = 0;
			let quxAttachCount = 0;
			let quxDetachCount = 0;

			class Qux extends WidgetBase {
				onAttach() {
					quxAttachCount++;
				}

				onDetach() {
					quxDetachCount++;
				}
			}

			class Foo extends WidgetBase {
				onAttach() {
					fooAttachCount++;
				}

				onDetach() {
					fooDetachCount++;
				}

				render() {
					return [w(Qux, { key: '1' }), v('div', [w(Qux, { key: '2' })])];
				}
			}

			class Bar extends WidgetBase {
				onAttach() {
					barAttachCount++;
				}

				onDetach() {
					barDetachCount++;
				}
			}

			class FooBar extends WidgetBase {}

			let invalidate: any;
			class Baz extends WidgetBase {
				private _foo = false;

				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				onAttach() {
					bazAttachCount++;
				}

				onDetach() {
					bazDetachCount++;
				}

				render() {
					this._foo = !this._foo;
					return v('div', [
						w(FooBar, {}),
						this._foo ? w(Foo, { key: '1' }) : null,
						w(FooBar, {}),
						this._foo ? w(Foo, { key: '2' }) : w(Bar, {})
					]);
				}
			}
			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolve();
			assert.strictEqual(bazAttachCount, 1);
			assert.strictEqual(bazDetachCount, 0);
			assert.strictEqual(fooAttachCount, 2);
			assert.strictEqual(fooDetachCount, 0);
			assert.strictEqual(barAttachCount, 0);
			assert.strictEqual(barDetachCount, 0);
			assert.strictEqual(quxAttachCount, 4);
			assert.strictEqual(quxDetachCount, 0);
			invalidate();
			resolvers.resolve();
			resolvers.resolve();
			assert.strictEqual(bazAttachCount, 1);
			assert.strictEqual(bazDetachCount, 0);
			assert.strictEqual(fooAttachCount, 2);
			assert.strictEqual(fooDetachCount, 2);
			assert.strictEqual(barAttachCount, 1);
			assert.strictEqual(barDetachCount, 0);
			assert.strictEqual(quxAttachCount, 4);
			assert.strictEqual(quxDetachCount, 4);
			invalidate();
			resolvers.resolve();
			resolvers.resolve();
			assert.strictEqual(bazAttachCount, 1);
			assert.strictEqual(bazDetachCount, 0);
			assert.strictEqual(fooAttachCount, 4);
			assert.strictEqual(fooDetachCount, 2);
			assert.strictEqual(barAttachCount, 1);
			assert.strictEqual(barDetachCount, 1);
			assert.strictEqual(quxAttachCount, 8);
			assert.strictEqual(quxDetachCount, 4);
			invalidate();
			resolvers.resolve();
			resolvers.resolve();
			assert.strictEqual(bazAttachCount, 1);
			assert.strictEqual(bazDetachCount, 0);
			assert.strictEqual(fooAttachCount, 4);
			assert.strictEqual(fooDetachCount, 4);
			assert.strictEqual(barAttachCount, 2);
			assert.strictEqual(barDetachCount, 1);
			assert.strictEqual(quxAttachCount, 8);
			assert.strictEqual(quxDetachCount, 8);
		});

		it('calls onDetach after the root node has been removed', () => {
			let removeChildCount = 0;
			let toggleShow: any;
			const onDetachStub = stub();

			class Bar extends WidgetBase {
				render() {
					return v('span');
				}

				onDetach() {
					onDetachStub();
				}
			}

			class Foo extends WidgetBase {
				private _show = true;

				constructor() {
					super();
					toggleShow = this.toggleShow;
				}

				toggleShow = () => {
					this._show = !this._show;
					this.invalidate();
				};

				render() {
					return this._show ? w(Bar, {}) : null;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			const remove = div.removeChild.bind(div);
			div.removeChild = (child: any) => {
				removeChildCount++;
				assert.isTrue(onDetachStub.notCalled);
				return remove(child);
			};
			r.mount({ domNode: div });
			toggleShow();
			resolvers.resolveRAF();
			assert.isTrue(onDetachStub.calledOnce);
			assert.strictEqual(removeChildCount, 1);
			resolvers.resolveRIC();
			assert.isTrue(onDetachStub.calledOnce);
			assert.strictEqual(removeChildCount, 1);
		});

		it('calls onDetach after the root nodes has been removed', () => {
			let removeChildCount = 0;
			let toggleShow: any;
			const onDetachStub = stub();

			class Bar extends WidgetBase {
				render() {
					return [v('span'), v('div')];
				}

				onDetach() {
					onDetachStub();
				}
			}

			class Foo extends WidgetBase {
				private _show = true;

				constructor() {
					super();
					toggleShow = this.toggleShow;
				}

				toggleShow = () => {
					this._show = !this._show;
					this.invalidate();
				};

				render() {
					return this._show ? w(Bar, {}) : null;
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			const remove = div.removeChild.bind(div);
			div.removeChild = (child: any) => {
				removeChildCount++;
				assert.isTrue(onDetachStub.notCalled);
				return remove(child);
			};
			r.mount({ domNode: div, sync: true });
			toggleShow();
			assert.isTrue(onDetachStub.called);
			assert.strictEqual(removeChildCount, 2);
		});

		it('should use the latest version of nodes when calling remove', () => {
			let showFooNodes: any;
			class Baz extends WidgetBase {
				render() {
					return ['one', 'two'];
				}
			}

			class Qux extends WidgetBase {
				render() {
					return w(Foo, {});
				}
			}

			class Foo extends WidgetBase {
				private _show = false;
				private _toggleShow = () => {
					this._show = !this._show;
					this.invalidate();
				};
				constructor() {
					super();
					showFooNodes = this._toggleShow;
				}
				render() {
					if (this._show) {
						return w(Baz, {});
					}
					return null;
				}
			}

			let toggleShow: any;
			class Bar extends WidgetBase {
				private _show = true;
				constructor() {
					super();
					toggleShow = this.toggleShow;
				}

				toggleShow = () => {
					this._show = !this._show;
					this.invalidate();
				};
				render() {
					return v('div', [this._show ? w(Qux, {}) : null, this._show ? null : 'three']);
				}
			}

			const r = renderer(() => w(Bar, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 0);
			showFooNodes();
			assert.lengthOf(root.childNodes, 2);
			toggleShow();
			assert.lengthOf(root.childNodes, 1);
		});

		it('should not throw error running `onDetach` for widgets that do not have any rendered children', () => {
			class Foo extends WidgetBase {
				render() {
					return null;
				}
			}

			class Bar extends WidgetBase {
				render() {
					return w(Foo, {});
				}
			}

			let invalidate: any;
			class Baz extends WidgetBase {
				private _show = false;

				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}

				render() {
					this._show = !this._show;
					return this._show ? w(Bar, {}) : null;
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolve();
			invalidate();
			assert.doesNotThrow(() => {
				resolvers.resolve();
			});
		});

		it('remove elements for embedded WNodes', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', { id: 'foo' });
				}
			}

			class Bar extends WidgetBase {
				render() {
					return w(Foo, {});
				}
			}

			let show: any;
			class Baz extends WidgetBase {
				private _show = true;

				constructor() {
					super();
					show = this.setShow;
				}

				setShow = (value: boolean) => {
					this._show = value;
					this.invalidate();
				};

				render() {
					return v('div', [this._show ? w(Bar, {}) : null]);
				}
			}

			const r = renderer(() => w(Baz, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as Element;
			const fooDiv = root.childNodes[0] as HTMLDivElement;
			assert.strictEqual(fooDiv.getAttribute('id'), 'foo');
			show(false);
			assert.isNull(fooDiv.parentNode);
		});

		it('Should support widgets using deferred properties', () => {
			let deferredPropertyCallCount = 0;

			class Bar extends WidgetBase<any> {
				render() {
					return v(
						'div',
						() => {
							deferredPropertyCallCount++;
							return {
								id: 'bar-root',
								key: 'bar-root'
							};
						},
						[
							v('div', () => {
								deferredPropertyCallCount++;
								return {
									id: 'bar-container',
									key: 'bar-container',
									innerHTML: 'bar-container'
								};
							})
						]
					);
				}
			}

			let invalidate: any;
			class Foo extends WidgetBase<any> {
				constructor() {
					super();
					invalidate = this.invalidate.bind(this);
				}
				render() {
					return v(
						'div',
						() => {
							deferredPropertyCallCount++;
							return {
								id: 'foo-root',
								key: 'root'
							};
						},
						[
							v('div', () => {
								deferredPropertyCallCount++;
								return {
									key: 'foo-container',
									id: 'container',
									innerHTML: 'foo-container'
								};
							}),
							w(Bar, { key: 'bar' })
						]
					);
				}
			}

			const r = renderer(() => w(Foo, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolveRAF();
			assert.strictEqual(deferredPropertyCallCount, 8);
			const root = div.childNodes[0] as Element;
			assert.lengthOf(root.childNodes, 2);
			const fooContainer = root.childNodes[0];
			assert.lengthOf(fooContainer.childNodes, 1);
			const fooLabel = fooContainer.childNodes[0] as Text;
			assert.strictEqual(fooLabel.data, 'foo-container');
			const barRoot = root.childNodes[1];
			assert.lengthOf(barRoot.childNodes, 1);
			const barContainer = barRoot.childNodes[0];
			assert.lengthOf(barContainer.childNodes, 1);
			const barLabel = barContainer.childNodes[0] as Text;
			assert.strictEqual(barLabel.data, 'bar-container');
			resolvers.resolveRIC();
			assert.strictEqual(deferredPropertyCallCount, 8);
			invalidate();
			resolvers.resolveRAF();
			assert.strictEqual(deferredPropertyCallCount, 12);
			resolvers.resolveRIC();
			assert.strictEqual(deferredPropertyCallCount, 12);
		});

		it('should replace keyed nodes', () => {
			let swap: any;
			class App extends WidgetBase {
				private _swap = false;
				constructor() {
					super();
					swap = () => {
						this._swap = !this._swap;
						this.invalidate();
					};
				}
				render() {
					if (this._swap) {
						return v('div', [
							v('div', { id: '1', key: '1' }),
							v('div', { id: '2', key: '2' }),
							v('div', { id: '3', key: '3' }),
							v('div', { id: '4', key: '4' }),
							v('div', { id: '5', key: '5' }),
							v('div', { id: '6', key: '6' }),
							v('div', { id: '7', key: '7' })
						]);
					}
					return v('div', [
						v('div', { id: '11', key: '11' }),
						v('div', { id: '12', key: '12' }),
						v('div', { id: '13', key: '13' }),
						v('div', { id: '14', key: '14' }),
						v('div', { id: '15', key: '15' }),
						v('div', { id: '16', key: '16' }),
						v('div', { id: '17', key: '17' })
					]);
				}
			}
			const r = renderer(() => w(App, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root });
			assert.strictEqual(
				root.outerHTML,
				'<div><div><div id="11"></div><div id="12"></div><div id="13"></div><div id="14"></div><div id="15"></div><div id="16"></div><div id="17"></div></div></div>'
			);
			swap();
			resolvers.resolve();
			assert.strictEqual(
				root.outerHTML,
				'<div><div><div id="1"></div><div id="2"></div><div id="3"></div><div id="4"></div><div id="5"></div><div id="6"></div><div id="7"></div></div></div>'
			);
		});

		describe('supports merging with a widget returned a the top level', () => {
			it('Supports merging DNodes onto existing HTML', () => {
				const iframe = document.createElement('iframe');
				document.body.appendChild(iframe);
				iframe.contentDocument!.write(
					`<div class="foo"><label for="baz">Select Me:</label><select type="text" name="baz" id="baz" disabled="disabled"><option value="foo">label foo</option><option value="bar" selected="">label bar</option><option value="baz">label baz</option></select><button type="button" disabled="disabled">Click Me!</button></div>`
				);
				iframe.contentDocument!.close();
				const root = iframe.contentDocument!.body.firstChild as HTMLElement;
				const childElementCount = root.childElementCount;
				const select = root.childNodes[1] as HTMLSelectElement;
				const button = root.childNodes[2] as HTMLButtonElement;
				assert.strictEqual(select.value, 'bar', 'bar should be selected');
				const onclickListener = spy();
				class Foo extends WidgetBase {
					render() {
						return v(
							'div',
							{
								classes: ['foo', 'bar']
							},
							[
								v(
									'label',
									{
										for: 'baz'
									},
									['Select Me:']
								),
								v(
									'select',
									{
										type: 'text',
										name: 'baz',
										id: 'baz',
										disabled: false
									},
									[
										v('option', { value: 'foo', selected: true }, ['label foo']),
										v('option', { value: 'bar', selected: false }, ['label bar']),
										v('option', { value: 'baz', selected: false }, ['label baz'])
									]
								),
								v(
									'button',
									{
										type: 'button',
										disabled: false,
										onclick: onclickListener
									},
									['Click Me!']
								)
							]
						);
					}
				}

				class Bar extends WidgetBase {
					render() {
						return w(Foo, {});
					}
				}
				const r = renderer(() => w(Bar, {}));
				r.mount({ domNode: iframe.contentDocument!.body, sync: true });
				assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
				assert.strictEqual(
					root.childElementCount,
					childElementCount,
					'should have the same number of children'
				);
				assert.strictEqual(select, root.childNodes[1], 'should have been reused');
				assert.strictEqual(button, root.childNodes[2], 'should have been reused');
				assert.isFalse(select.disabled, 'select should be enabled');
				assert.isFalse(button.disabled, 'button should be enabled');

				assert.strictEqual(select.value, 'foo', 'foo should be selected');
				assert.strictEqual(select.children.length, 3, 'should have 3 children');

				assert.isFalse(onclickListener.called, 'onclickListener should not have been called');

				const clickEvent = document.createEvent('CustomEvent');
				clickEvent.initEvent('click', true, true);
				button.dispatchEvent(clickEvent);
				assert.isTrue(onclickListener.called, 'onclickListener should have been called');

				document.body.removeChild(iframe);
			});

			it('Supports merging DNodes with widgets onto existing HTML', () => {
				const iframe = document.createElement('iframe');
				document.body.appendChild(iframe);
				iframe.contentDocument!.write(
					`<div class="foo"><label for="baz">Select Me:</label><select type="text" name="baz" id="baz" disabled="disabled"><option value="foo">label foo</option><option value="bar" selected="">label bar</option><option value="baz">label baz</option></select><button type="button" disabled="disabled">Click Me!</button><span>label</span><div>last node</div></div>`
				);
				iframe.contentDocument!.close();
				const root = iframe.contentDocument!.body.firstChild as HTMLElement;
				const childElementCount = root.childElementCount;
				const label = root.childNodes[0] as HTMLLabelElement;
				const select = root.childNodes[1] as HTMLSelectElement;
				const button = root.childNodes[2] as HTMLButtonElement;
				const span = root.childNodes[3] as HTMLElement;
				const div = root.childNodes[4] as HTMLElement;
				assert.strictEqual(select.value, 'bar', 'bar should be selected');
				const onclickListener = spy();

				class Button extends WidgetBase {
					render() {
						return [
							v('button', { type: 'button', disabled: false, onclick: onclickListener }, ['Click Me!']),
							v('span', {}, ['label'])
						];
					}
				}
				class Foo extends WidgetBase {
					render() {
						return v(
							'div',
							{
								classes: ['foo', 'bar']
							},
							[
								v(
									'label',
									{
										for: 'baz'
									},
									['Select Me:']
								),
								v(
									'select',
									{
										type: 'text',
										name: 'baz',
										id: 'baz',
										disabled: false
									},
									[
										v('option', { value: 'foo', selected: true }, ['label foo']),
										v('option', { value: 'bar', selected: false }, ['label bar']),
										v('option', { value: 'baz', selected: false }, ['label baz'])
									]
								),
								w(Button, {}),
								v('div', ['last node'])
							]
						);
					}
				}
				class Bar extends WidgetBase {
					render() {
						return w(Foo, {});
					}
				}
				const r = renderer(() => w(Bar, {}));
				r.mount({ domNode: iframe.contentDocument!.body, sync: true });
				assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
				assert.strictEqual(
					root.childElementCount,
					childElementCount,
					'should have the same number of children'
				);
				assert.strictEqual(label, root.childNodes[0], 'should have been reused');
				assert.strictEqual(select, root.childNodes[1], 'should have been reused');
				assert.strictEqual(button, root.childNodes[2], 'should have been reused');
				assert.strictEqual(span, root.childNodes[3], 'should have been reused');
				assert.strictEqual(div, root.childNodes[4], 'should have been reused');
				assert.isFalse(select.disabled, 'select should be enabled');
				assert.isFalse(button.disabled, 'button should be enabled');

				assert.strictEqual(select.value, 'foo', 'foo should be selected');
				assert.strictEqual(select.children.length, 3, 'should have 3 children');

				assert.isFalse(onclickListener.called, 'onclickListener should not have been called');

				const clickEvent = document.createEvent('CustomEvent');
				clickEvent.initEvent('click', true, true);
				button.dispatchEvent(clickEvent);
				assert.isTrue(onclickListener.called, 'onclickListener should have been called');

				document.body.removeChild(iframe);
			});

			it('Removes unknown nodes when merging', () => {
				const iframe = document.createElement('iframe');
				document.body.appendChild(iframe);
				iframe.contentDocument!.write(`
				<div class="foo">
					<label for="baz">Select Me:</label>
					<select type="text" name="baz" id="baz" disabled="disabled">
						<option value="foo">label foo</option>
						<option value="bar" selected="">label bar</option>
						<option value="baz">label baz</option>
					</select>
					<button type="button" disabled="disabled">Click Me!</button>
					<span>label</span>
					<div>last node</div>
				</div>`);
				iframe.contentDocument!.close();
				const root = iframe.contentDocument!.body.firstChild as HTMLElement;
				const childElementCount = root.childElementCount;
				const label = root.childNodes[1] as HTMLLabelElement;
				const select = root.childNodes[3] as HTMLSelectElement;
				const button = root.childNodes[5] as HTMLButtonElement;
				const span = root.childNodes[7] as HTMLElement;
				const div = root.childNodes[9] as HTMLElement;
				assert.strictEqual(select.value, 'bar', 'bar should be selected');
				const onclickListener = spy();

				class Button extends WidgetBase {
					render() {
						return [
							v('button', { type: 'button', disabled: false, onclick: onclickListener }, ['Click Me!']),
							v('span', {}, ['label'])
						];
					}
				}
				class Foo extends WidgetBase {
					render() {
						return v(
							'div',
							{
								classes: ['foo', 'bar']
							},
							[
								v(
									'label',
									{
										for: 'baz'
									},
									['Select Me:']
								),
								v(
									'select',
									{
										type: 'text',
										name: 'baz',
										id: 'baz',
										disabled: false
									},
									[
										v('option', { value: 'foo', selected: true }, ['label foo']),
										v('option', { value: 'bar', selected: false }, ['label bar']),
										v('option', { value: 'baz', selected: false }, ['label baz'])
									]
								),
								w(Button, {}),
								v('div', ['last node'])
							]
						);
					}
				}
				class Bar extends WidgetBase {
					render() {
						return w(Foo, {});
					}
				}
				const r = renderer(() => w(Bar, {}));
				r.mount({ domNode: iframe.contentDocument!.body, sync: true });
				assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
				assert.strictEqual(
					root.childElementCount,
					childElementCount,
					'should have the same number of children'
				);
				assert.strictEqual(label, root.childNodes[0], 'should have been reused');
				assert.strictEqual(select, root.childNodes[1], 'should have been reused');
				assert.strictEqual(button, root.childNodes[2], 'should have been reused');
				assert.strictEqual(span, root.childNodes[3], 'should have been reused');
				assert.strictEqual(div, root.childNodes[4], 'should have been reused');
				assert.isFalse(select.disabled, 'select should be enabled');
				assert.isFalse(button.disabled, 'button should be enabled');

				assert.strictEqual(select.value, 'foo', 'foo should be selected');
				assert.strictEqual(select.children.length, 3, 'should have 3 children');

				assert.isFalse(onclickListener.called, 'onclickListener should not have been called');

				const clickEvent = document.createEvent('CustomEvent');
				clickEvent.initEvent('click', true, true);
				button.dispatchEvent(clickEvent);
				assert.isTrue(onclickListener.called, 'onclickListener should have been called');

				document.body.removeChild(iframe);
			});

			it('Should only merge on the first render', () => {
				const iframe = document.createElement('iframe');
				document.body.appendChild(iframe);
				iframe.contentDocument!.write(`<div>Loading</div>`);
				iframe.contentDocument!.close();
				const root = iframe.contentDocument!.body.firstChild as HTMLElement;

				class Bar extends WidgetBase<any> {
					render() {
						return v('div', [`Item ${this.properties.id}`]);
					}
				}

				let invalidate: any;
				class Foo extends WidgetBase {
					private _renderCount = 0;

					constructor() {
						super();
						invalidate = this.invalidate.bind(this);
					}

					render() {
						let nodes;
						if (this._renderCount === 0) {
							nodes = v('div', ['Loading']);
						} else {
							nodes = v('div', [
								w(Bar, { key: '1', id: '1' }),
								w(Bar, { key: '2', id: '2' }),
								w(Bar, { key: '3', id: '3' })
							]);
						}
						this._renderCount++;
						return nodes;
					}
				}
				const r = renderer(() => w(Foo, {}));
				r.mount({ domNode: iframe.contentDocument!.body, sync: true });
				assert.lengthOf(root.childNodes, 1);
				invalidate();
				assert.strictEqual(root.childNodes.length, 3);
				assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'Item 1');
				assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'Item 2');
				assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, 'Item 3');
				document.body.removeChild(iframe);
			});

			it('should render in the correct order when inserting a node between nodes that already exist on a merge', () => {
				class App extends WidgetBase {
					render() {
						return v('div', [
							v('header', { id: 'header' }),
							v('div', { id: 'my-body' }),
							v('footer', { id: 'footer' }, [v('span', ['span'])])
						]);
					}
				}

				const div = document.createElement('div');
				const header = document.createElement('header');
				const root = document.createElement('div');
				header.id = 'header';
				const footer = document.createElement('footer');
				const footerChild = document.createElement('span');
				const footerText = document.createTextNode('span');
				footerChild.appendChild(footerText);
				footer.appendChild(footerChild);
				footer.id = 'footer';
				div.appendChild(root);
				root.appendChild(header);
				root.appendChild(footer);
				const r = renderer(() => w(App, {}));
				r.mount({ domNode: div });
				assert.strictEqual(
					div.outerHTML,
					'<div><div><header id="header"></header><div id="my-body"></div><footer id="footer"><span>span</span></footer></div></div>'
				);
			});
		});

		describe('functional', () => {
			it('Should render nodes in the correct order with mix of vnode and wnodes', () => {
				const createWidget = create();

				const WidgetOne = createWidget(() => WidgetTwo({}));
				const WidgetTwo = createWidget(() => v('div', ['dom2']));
				const WidgetThree = createWidget(() => ['dom3', 'dom3a']);
				const WidgetFour = createWidget(() => WidgetFive({}));
				const WidgetFive = createWidget(() => WidgetSix({}));
				const WidgetSix = createWidget(() => 'dom5');
				const App = createWidget(() => [
					'dom1',
					WidgetOne({}),
					WidgetThree({}),
					'dom4',
					WidgetFour({}),
					'dom6'
				]);

				const r = renderer(() => App({}));
				const root: any = document.createElement('div');
				r.mount({ domNode: root });
				assert.strictEqual(root.childNodes[0].data, 'dom1');
				assert.strictEqual(root.childNodes[1].childNodes[0].data, 'dom2');
				assert.strictEqual(root.childNodes[2].data, 'dom3');
				assert.strictEqual(root.childNodes[3].data, 'dom3a');
				assert.strictEqual(root.childNodes[4].data, 'dom4');
				assert.strictEqual(root.childNodes[5].data, 'dom5');
				assert.strictEqual(root.childNodes[6].data, 'dom6');
			});

			it('Re-renders widget based on property changes', () => {
				let label = 'default';
				const createWidget = create({ invalidator });
				const Foo = createWidget.properties<{ label: string; other: boolean }>()(
					({ properties }) => properties.label
				);
				const App = createWidget.properties()(({ middleware }) => {
					const setLabel = () => {
						label = 'custom';
						middleware.invalidator();
					};
					return v('div', [v('button', { onclick: setLabel }, ['Set']), Foo({ other: true, label })]);
				});
				const root = document.createElement('div');
				const r = renderer(() => App({}));
				r.mount({ domNode: root });
				assert.strictEqual(root.outerHTML, '<div><div><button>Set</button>default</div></div>');
				const button = root.childNodes[0].childNodes[0] as HTMLButtonElement;
				sendEvent(button, 'click');
				resolvers.resolve();
				assert.strictEqual(root.outerHTML, '<div><div><button>Set</button>custom</div></div>');
				sendEvent(button, 'click');
				resolvers.resolve();
				assert.strictEqual(root.outerHTML, '<div><div><button>Set</button>custom</div></div>');
			});

			it('supports widget registry items', () => {
				const registry = new Registry();
				const createWidget = create();
				const Foo = createWidget.properties<{ text: string }>()(({ properties }) => v('h1', [properties.text]));
				const Bar = createWidget.properties<{ text: string }>()(({ properties }) => v('h1', [properties.text]));

				registry.define('foo', Foo);
				registry.define('bar', Bar);
				const Baz = createWidget(() => v('div', [w('foo', { text: 'foo' }), w('bar', { text: 'bar' })]));

				const r = renderer(() => Baz({}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, registry });
				const root = div.childNodes[0];
				const headerOne = root.childNodes[0];
				const headerOneText = headerOne.childNodes[0] as Text;
				const headerTwo = root.childNodes[1];
				const headerTwoText = headerTwo.childNodes[0] as Text;
				assert.strictEqual(headerOneText.data, 'foo');
				assert.strictEqual(headerTwoText.data, 'bar');
			});

			it('support top level registry items', () => {
				const createWidget = create();
				const registry = new Registry();
				const Foo = createWidget(() => 'Top Level Registry');

				let resolver: any;
				const promise = new Promise<any>((resolve) => {
					resolver = resolve;
				});

				const r = renderer(() =>
					w(
						{
							label: 'foo',
							registryItem: () => {
								return promise;
							}
						},
						{}
					)
				);
				const div = document.createElement('div');
				r.mount({ domNode: div, registry, sync: true });
				resolver(Foo);
				assert.strictEqual(div.outerHTML, '<div></div>');
				return promise.then(() => {
					assert.strictEqual(div.outerHTML, '<div>Top Level Registry</div>');
				});
			});

			it('Should pause rendering while merging to allow lazily loaded widgets to be loaded', () => {
				const createWidget = create();
				const iframe = document.createElement('iframe');
				document.body.appendChild(iframe);
				iframe.contentDocument!.write(`<div><span>54321</span><span>98765</span><span>12345</span></div>`);
				iframe.contentDocument!.close();

				const root = iframe.contentDocument!.body.firstChild as HTMLElement;
				const lazyFooSpan = root.childNodes[0] as HTMLSpanElement;
				const lazyBarSpan = root.childNodes[1] as HTMLSpanElement;
				const span = root.childNodes[2] as HTMLSpanElement;
				const registry = new Registry();

				const Bar = createWidget(() => v('span', ['98765']));

				let barResolver: any;
				const barPromise = new Promise<any>((resolve) => {
					barResolver = resolve;
				});

				const Foo = createWidget(() => [
					v('span', ['54321']),
					w({ label: 'bar', registryItem: () => barPromise }, {})
				]);

				let fooResolver: any;
				const fooPromise = new Promise<any>((resolve) => {
					fooResolver = resolve;
				});

				const App = createWidget(() =>
					v('div', [
						w(
							{
								label: 'foo',
								registryItem: () => fooPromise
							},
							{}
						),
						v('span', ['12345'])
					])
				);

				const r = renderer(() => App({}));
				r.mount({ registry, domNode: iframe.contentDocument!.body, sync: true });
				fooResolver(Foo);
				return fooPromise.then(() => {
					assert.strictEqual(root.childNodes[2], span);
					assert.strictEqual(root.childNodes[1], lazyBarSpan);
					assert.strictEqual(root.childNodes[0], lazyFooSpan);
					barResolver(Bar);
					return barPromise.then(() => {
						assert.strictEqual(root.childNodes[2], span);
						assert.strictEqual(root.childNodes[1], lazyBarSpan);
						assert.strictEqual(root.childNodes[0], lazyFooSpan);
					});
				});
			});

			it('registry items', () => {
				const createWidget = create();
				let resolver = () => {};
				const registry = new Registry();
				const Widget = createWidget(() => v('div', ['Hello, world!']));
				const RegistryWidget = createWidget(() => v('div', ['Registry, world!']));
				const promise = new Promise<any>((resolve) => {
					resolver = () => {
						resolve(RegistryWidget);
					};
				});
				registry.define('registry-item', promise);
				const App = createWidget(() => [w('registry-item', {}), w(Widget, {})]);
				const r = renderer(() => App({}));
				const root = document.createElement('div');
				r.mount({ domNode: root, sync: true, registry });
				assert.lengthOf(root.childNodes, 1);
				assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'Hello, world!');
				resolver();
				return promise.then(() => {
					assert.lengthOf(root.childNodes, 2);
					assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, 'Registry, world!');
					assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, 'Hello, world!');
				});
			});

			it('removes existing widget and uses new widget when widget changes', () => {
				const createWidget = create({ invalidator });

				let visible = true;
				let swap: any;

				const Foo = createWidget.properties<{ text: string }>()(({ properties }) => properties.text);
				const Bar = createWidget.properties<{ text: string }>()(({ properties }) => properties.text);
				const App = createWidget(({ middleware }) => {
					swap = () => {
						visible = !visible;
						middleware.invalidator();
					};
					return v('div', [
						visible ? Foo({ text: 'foo' }) : Bar({ text: 'bar' }),
						visible ? Bar({ key: '1', text: 'bar1' }) : Bar({ key: '2', text: 'bar2' })
					]);
				});
				const r = renderer(() => App({}));
				const div = document.createElement('div');
				r.mount({ domNode: div });
				resolvers.resolve();
				assert.strictEqual(div.outerHTML, '<div><div>foobar1</div></div>');
				swap();
				resolvers.resolve();
				assert.strictEqual(div.outerHTML, '<div><div>barbar2</div></div>');
			});
		});
	});

	describe('create', () => {
		it('should support rendering vnodes only', () => {
			const r = renderer(() => v('div', ['hello, world!']));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>hello, world!</div>');
		});

		it('should create and update single text nodes', () => {
			const [Widget, meta] = getWidget(v('div', ['text']));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text</div>');
			meta.setRenderResult(v('div', ['text2']));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text2</div>');
			meta.setRenderResult(v('div', ['text2', v('span', ['a'])]));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text2<span>a</span></div>');

			meta.setRenderResult(v('div', ['text2']));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text2</div>');
			meta.setRenderResult(v('div', ['text']));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text</div>');
		});

		it('should work correctly with adjacent text nodes', () => {
			const [Widget, meta] = getWidget(v('div', ['', '1', '']));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>1</div>');
			meta.setRenderResult(v('div', [' ', '']));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div> </div>');
			meta.setRenderResult(v('div', ['', '1', '']));
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>1</div>');
		});

		it('should break update when vdom object references are equal', () => {
			const vnode = v('div', ['text']);
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text</div>');
			vnode.text = 'new';
			meta.setRenderResult(vnode);
			assert.strictEqual((div.childNodes[0] as Element).outerHTML, '<div>text</div>');
		});

		it('should allow changing the root selector', () => {
			const [Widget, meta] = getWidget(v('div'));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(div.children[0].tagName, 'DIV');
			meta.setRenderResult(v('span'));
			assert.strictEqual(div.children[0].tagName, 'SPAN');
		});

		it('should allow an existing dom node to be used', () => {
			const node = document.createElement('div');
			(node as any).foo = 'foo';
			const childNode = document.createElement('span');
			(childNode as any).bar = 'bar';
			node.appendChild(childNode);
			const appendChildSpy = spy(node, 'appendChild');

			const childVNode = v('span', { id: 'b' }) as DomVNode;
			childVNode.domNode = childNode;
			const vNode = v('div', { id: 'a' }, [childVNode]) as DomVNode;
			vNode.domNode = node;

			const root: any = document.createElement('div');
			const [Widget] = getWidget(vNode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: root, sync: true });
			assert.strictEqual(root.childNodes[0].outerHTML, '<div id="a"><span id="b"></span></div>');
			assert.strictEqual(root.childNodes[0].foo, 'foo');
			assert.strictEqual(root.childNodes[0].children[0].bar, 'bar');
			assert.isFalse(appendChildSpy.called);
		});

		it('will append nodes with attributes already attached', (test) => {
			const expected = '<div data-attr="test"></div>';
			const appendedHtml: string[] = [];

			const createElement = document.createElement.bind(document);
			const createElementStub = stub(document, 'createElement').callsFake((name: string) => {
				const node = createElement(name);
				const appendChild = node.appendChild.bind(node);
				stub(node, 'insertBefore').callsFake((node: Element) => {
					appendedHtml.push(node.outerHTML);
					return appendChild(node);
				});
				return node;
			});
			spys.push(createElementStub);
			const [Widget] = getWidget(v('div', { 'data-attr': 'test' }));
			const root: any = document.createElement('div');
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: root, sync: true });
			assert.strictEqual(root.innerHTML, expected);
			assert.lengthOf(appendedHtml, 1);
			assert.strictEqual(appendedHtml[0], expected);
		});
	});

	describe('properties', () => {
		it('does not add "key" to the dom node', () => {
			const [Widget] = getWidget(v('div', { key: '1' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.isNull(root.getAttribute('key'));
		});

		it('sets properties even when the default DOM node value matches', () => {
			const [Widget] = getWidget(v('div', { tabIndex: -1 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual(root.getAttribute('tabindex'), '-1');
		});

		it('updates attributes', () => {
			const [Widget, meta] = getWidget(v('a', { href: '#1' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual(root.getAttribute('href'), '#1');
			meta.setRenderResult(v('a', { href: '#2' }));
			assert.strictEqual(root.getAttribute('href'), '#2');
			meta.setRenderResult(v('a', { href: undefined }));
			assert.strictEqual(root.getAttribute('href'), '');
		});

		it('can add an attribute that was initially undefined', () => {
			const [Widget, meta] = getWidget(v('a', { href: undefined }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const link = (div.childNodes[0] as Element) as HTMLLinkElement;
			assert.isNull(link.getAttribute('href'));
			meta.setRenderResult(v('a', { href: '#2' }));
			assert.strictEqual(link.getAttribute('href'), '#2');
		});

		it('can remove disabled property when set to null or undefined', () => {
			const [Widget, meta] = getWidget(v('a', { disabled: true }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const link = div.childNodes[0] as HTMLLinkElement;
			assert.isTrue(link.disabled);
			meta.setRenderResult(v('a', { disabled: null as any }));
			assert.isFalse(!!link.disabled);
		});

		it('updates properties', () => {
			const [Widget, meta] = getWidget(v('a', { href: '#1', tabIndex: 1 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const link = div.childNodes[0] as HTMLLinkElement;
			assert.strictEqual(link.tabIndex, 1);
			meta.setRenderResult(v('a', { href: '#1', tabIndex: 2 }));
			assert.strictEqual(link.tabIndex, 2);
			meta.setRenderResult(v('a', { href: '#1', tabIndex: undefined }));
			assert.strictEqual(link.tabIndex, 0);
		});

		it('updates innerHTML', () => {
			const [Widget, meta] = getWidget(v('p', { innerHTML: '<span>INNER</span>' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0].textContent, 'INNER');
			meta.setRenderResult(v('p', { innerHTML: '<span>UPDATED</span>' }));
			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0].textContent, 'UPDATED');
		});

		it('does not mess up scrolling in Edge', () => {
			const [Widget, meta] = getWidget(v('div', { scrollTop: 0 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			Object.defineProperty(root, 'scrollTop', {
				get: () => 1,
				set: stub().throws('Setting scrollTop would mess up scrolling')
			}); // meaning: div.scrollTop = 1;
			meta.setRenderResult(v('div', { scrollTop: 1 }));
		});

		describe('classes', () => {
			it('adds and removes classes', () => {
				const [Widget, meta] = getWidget(v('div', { classes: ['a'] }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				assert.strictEqual(root.className, 'a');
				meta.setRenderResult(v('div', { classes: ['a', 'b'] }));
				assert.strictEqual(root.className, 'a b');
				meta.setRenderResult(v('div', { classes: ['b'] }));
				assert.strictEqual(root.className, 'b');
			});

			it('should leave classes that are not controlled', () => {
				const div = document.createElement('div');
				div.className = 'c b';
				const root = document.createElement('div');
				root.appendChild(div);
				const [Widget, meta] = getWidget(v('div', { classes: ['a'] }));
				const r = renderer(() => w(Widget, {}));
				r.mount({ domNode: root, sync: true });
				assert.strictEqual(div.className, 'b c a');
				meta.setRenderResult(v('div', { classes: ['a', 'b'] }));
				assert.strictEqual(div.className, 'a b');
				meta.setRenderResult(v('div', { classes: ['b'] }));
				assert.strictEqual(div.className, 'b');
				meta.setRenderResult(v('div'));
				assert.strictEqual(div.className, '');
			});

			it('supports null, undefined and zero length strings in classes', () => {
				const div = document.createElement('div');
				div.className = 'b';
				const root = document.createElement('div');
				root.appendChild(div);
				const [Widget, meta] = getWidget(v('div', { classes: ['b', null, null, null] }));
				const r = renderer(() => w(Widget, {}));
				r.mount({ domNode: root, sync: true });
				assert.strictEqual(div.className, 'b');
				meta.setRenderResult(v('div', { classes: ['a', null, undefined, ''] }));

				assert.strictEqual(div.className, 'a');

				meta.setRenderResult(v('div', { classes: ['a', null, undefined, ''] }));

				assert.strictEqual(div.className, 'a');
				meta.setRenderResult(v('div', { classes: [] }));

				assert.strictEqual(div.className, '');
				meta.setRenderResult(v('div', { classes: ['a', null, undefined, ''] }));

				assert.strictEqual(div.className, 'a');
				meta.setRenderResult(v('div'));

				assert.strictEqual(div.className, '');
			});

			it('classes accepts a string', () => {
				const [Widget, meta] = getWidget(v('div', { classes: 'b' }));
				const div = document.createElement('div');
				const root = document.createElement('div');
				root.appendChild(div);
				const r = renderer(() => w(Widget, {}));
				r.mount({ domNode: root, sync: true });
				assert.strictEqual(div.className, 'b');
				meta.setRenderResult(v('div', { classes: 'b' }));

				assert.strictEqual(div.className, 'b');

				meta.setRenderResult(v('div', { classes: 'a' }));

				assert.strictEqual(div.className, 'a');
				meta.setRenderResult(v('div'));

				assert.strictEqual(div.className, '');
				meta.setRenderResult(v('div', { classes: null }));

				assert.strictEqual(div.className, '');
				meta.setRenderResult(v('div'));

				meta.setRenderResult(v('div', { classes: 'a b' }));

				assert.strictEqual(div.className, 'a b');
			});

			it('should split class names by space before applying/removing', () => {
				const [Widget, meta] = getWidget(v('div', { classes: 'a b' }));
				const div = document.createElement('div');
				const root = document.createElement('div');
				root.appendChild(div);
				const r = renderer(() => w(Widget, {}));
				r.mount({ domNode: root, sync: true });
				assert.strictEqual(div.className, 'a b');
				meta.setRenderResult(v('div'));

				assert.strictEqual(div.className, '');

				meta.setRenderResult(v('div', { classes: ['a b'] }));

				assert.strictEqual(div.className, 'a b');
				meta.setRenderResult(v('div'));

				assert.strictEqual(div.className, '');
			});

			it('should accept falsy as a class', () => {
				const [Widget] = getWidget(v('div', { classes: ['my-class', null, undefined, false, true, 'other'] }));
				const div = document.createElement('div');
				const root = document.createElement('div');
				root.appendChild(div);
				const r = renderer(() => w(Widget, {}));
				r.mount({ domNode: root, sync: true });
				assert.strictEqual(div.className, 'my-class other');
			});

			it('can add and remove multiple classes in IE11', () => {
				const [Widget, meta] = getWidget(v('div', { classes: 'a b c d' }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				assert.strictEqual(root.className, 'a b c d');
				meta.setRenderResult(v('div', { classes: 'a b' }));
			});
		});

		describe('styles', () => {
			it('should add styles to the real DOM', () => {
				const [Widget] = getWidget(v('div', { styles: { height: '20px' } }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				assert.strictEqual(root.outerHTML, '<div style="height: 20px;"></div>');
			});

			it('should update styles', () => {
				const [Widget, meta] = getWidget(v('div', { styles: { height: '20px' } }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				meta.setRenderResult(v('div', { styles: { height: '30px' } }));

				assert.strictEqual(root.outerHTML, '<div style="height: 30px;"></div>');
			});

			it('should remove styles', () => {
				const [Widget, meta] = getWidget(v('div', { styles: { width: '30px', height: '20px' } }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				meta.setRenderResult(v('div', { styles: { height: null, width: '30px' } }));

				assert.strictEqual(root.outerHTML, '<div style="width: 30px;"></div>');
			});

			it('should add styles', () => {
				const [Widget, meta] = getWidget(v('div', { styles: { height: undefined } }));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				const root = div.childNodes[0] as HTMLElement;
				meta.setRenderResult(v('div', { styles: { height: '20px' } }));

				assert.strictEqual(root.outerHTML, '<div style="height: 20px;"></div>');
				meta.setRenderResult(v('div', { styles: { height: '20px' } }));
			});
		});

		it('updates the value property', () => {
			let typedKeys = '';
			const handleInput = (evt: Event) => {
				typedKeys = (evt.target as HTMLInputElement).value;
			};
			const renderFunction = () => v('input', { value: typedKeys, oninput: handleInput });
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLInputElement;
			assert.strictEqual(root.value, typedKeys);
			typedKeys = 'value1';
			meta.setRenderResult(renderFunction());
			assert.strictEqual(root.value, typedKeys);
		});

		it('does not clear a value that was set by a testing tool which manipulates input.value directly', () => {
			let typedKeys = '';
			const handleInput = (evt: Event) => {
				typedKeys = (evt.target as HTMLInputElement).value;
			};

			const renderFunction = () => v('input', { value: typedKeys, oninput: handleInput });

			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLInputElement;
			assert.strictEqual(root.value, typedKeys);
			root.value = 'value written by a testing tool without invoking the input event';
			meta.setRenderResult(renderFunction());
			assert.notStrictEqual(root.value, typedKeys);
		});

		it('Can handle oninput event handlers which pro-actively change element.value to correct user input when typing faster than 60 keys per second', () => {
			let model = '';
			const handleInput = (evt: Event) => {
				const inputElement = evt.target as HTMLInputElement;
				model = inputElement.value;
				if (model.indexOf(',') > 0) {
					model = model.replace(/,/g, '.');
					inputElement.value = model;
				}
			};

			const renderFunction = () => v('input', { value: model, oninput: handleInput });
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLInputElement;
			assert.strictEqual(root.value, model);

			root.value = '4';
			sendEvent(root, 'input');
			meta.setRenderResult(renderFunction());

			root.value = '4,';
			sendEvent(root, 'input');
			meta.setRenderResult(renderFunction());

			assert.strictEqual(root.value, '4.');

			model = '';
			meta.setRenderResult(renderFunction());

			assert.strictEqual(root.value, '');
		});

		it('removes the attribute when a role property is set to undefined', () => {
			let role: string | undefined = 'button';
			const renderFunction = () => v('div', { role: role });
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.property(root.attributes, 'role');
			assert.strictEqual(root.getAttribute('role'), role);
			role = undefined;
			meta.setRenderResult(renderFunction());
			assert.notProperty(root.attributes, 'role');
		});
	});

	describe('diffType', () => {
		it('Should diff against previous properties with diffType `vdom`', () => {
			let vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'vdom';
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'vdom';
			meta.setRenderResult(vnode);
			assert.strictEqual('baz', root.getAttribute('foo'));
			assert.strictEqual(2, root.bar);
			vnode = v('div', { foo: 'qux', bar: 3 });
			vnode.diffType = 'vdom';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
		});

		it('Should always set properties/attribute with diffType `none`', () => {
			let vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'none';
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'none';
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			vnode = v('div', { foo: 'qux', bar: 3 });
			vnode.diffType = 'none';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
		});

		it('Should diff against values on the DOM with diffType `dom`', () => {
			let vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'dom';
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = v('div', { foo: 'bar', bar: 1 });
			vnode.diffType = 'dom';
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			vnode = v('div', { foo: 'qux', bar: 3 });
			vnode.diffType = 'dom';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
		});

		it('Should use diffType `vdom` by default', () => {
			const [Widget, meta] = getWidget(v('div', { foo: 'bar', bar: 1 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			meta.setRenderResult(v('div', { foo: 'bar', bar: 1 }));
			assert.strictEqual('baz', root.getAttribute('foo'));
			assert.strictEqual(2, root.bar);
			meta.setRenderResult(v('div', { foo: 'qux', bar: 3 }));
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
		});
	});

	describe('dom VNode', () => {
		it('Should diff against previous properties with diffType `vdom`', () => {
			const append = document.createElement('div');
			const div = document.createElement('div');
			let clickerCount = 0;
			const click = () => {
				clickerCount++;
			};
			let vnode = d({
				node: div,
				props: { foo: 'bar', bar: 1 },
				attrs: { baz: 'foo', qux: 'qux' },
				on: { click },
				diffType: 'vdom'
			});
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: append, sync: true });
			const root = append.childNodes[0] as any;
			assert.strictEqual('bar', root.foo);
			assert.strictEqual('foo', root.getAttribute('baz'));
			assert.strictEqual('qux', root.getAttribute('qux'));
			assert.strictEqual(1, root.bar);
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 1);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = d({
				node: div,
				props: { foo: 'bar', bar: 2 },
				attrs: { baz: undefined, qux: 'qux' },
				on: { click },
				diffType: 'vdom'
			});
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.foo);
			assert.strictEqual(null, root.getAttribute('baz'));
			assert.strictEqual('qux', root.getAttribute('qux'));
			assert.strictEqual(2, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 2);
			vnode = d({
				node: div,
				props: { foo: 'qux', bar: 3 },
				attrs: { baz: 'foo', qux: 'qux' },
				diffType: 'vdom'
			});
			root.baz = 'baz';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.foo);
			assert.strictEqual('foo', root.getAttribute('baz'));
			assert.strictEqual('qux', root.getAttribute('qux'));
			assert.strictEqual(3, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 2);
		});
		it('Should always set properties/attribute with diffType `none`', () => {
			const append = document.createElement('div');
			const div = document.createElement('div');
			let clickerCount = 0;
			let secondClickerCount = 0;
			const click = () => {
				clickerCount++;
			};
			const secondClick = () => {
				secondClickerCount++;
			};
			let vnode = d({ node: div, props: { bar: 1 }, attrs: { foo: 'bar' }, on: { click }, diffType: 'none' });
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: append, sync: true });
			const root = append.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 1);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = d({
				node: div,
				props: { bar: 1 },
				attrs: { foo: 'bar' },
				on: { click: secondClick },
				diffType: 'none'
			});
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 1);
			assert.strictEqual(secondClickerCount, 1);
			vnode = d({ node: div, props: { bar: 3 }, attrs: { foo: 'qux' }, diffType: 'none' });
			vnode.diffType = 'none';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 1);
			assert.strictEqual(secondClickerCount, 1);
		});
		it('Should diff against values on the DOM with diffType `dom`', () => {
			const append = document.createElement('div');
			const div = document.createElement('div');
			let clickerCount = 0;
			const click = () => {
				clickerCount++;
			};
			let vnode = d({ node: div, props: { bar: 1 }, attrs: { foo: 'bar' }, on: { click }, diffType: 'dom' });
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: append, sync: true });
			const root = append.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 1);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = d({ node: div, props: { bar: 1 }, attrs: { foo: 'bar' }, on: { click }, diffType: 'dom' });
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 2);
			vnode = d({ node: div, props: { bar: 3 }, attrs: { foo: 'qux' }, diffType: 'dom' });
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
			root.dispatchEvent(clickEvent);
			assert.strictEqual(clickerCount, 2);
		});
		it('Should use diffType `none` by default', () => {
			const append = document.createElement('div');
			const div = document.createElement('div');
			let vnode = d({ node: div, props: { bar: 1 }, attrs: { foo: 'bar' } });
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: append, sync: true });
			const root = append.childNodes[0] as any;
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			root.bar = 2;
			root.setAttribute('foo', 'baz');
			vnode = d({ node: div, props: { bar: 1 }, attrs: { foo: 'bar' } });
			meta.setRenderResult(vnode);
			assert.strictEqual('bar', root.getAttribute('foo'));
			assert.strictEqual(1, root.bar);
			vnode = d({ node: div, props: { bar: 3 }, attrs: { foo: 'qux' } });
			vnode.diffType = 'none';
			meta.setRenderResult(vnode);
			assert.strictEqual('qux', root.getAttribute('foo'));
			assert.strictEqual(3, root.bar);
		});
		it('Should move a text node to the parent VNode dom node', () => {
			const append = document.createElement('div');
			const div = document.createElement('div');
			const text = document.createTextNode('foo');
			div.appendChild(text);
			let vnode = v('div', [d({ node: text })]);
			const [Widget] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: append, sync: true });
			const root = append.childNodes[0] as any;
			assert.strictEqual(root.childNodes.length, 1);
			assert.strictEqual(div.childNodes.length, 0);
			assert.strictEqual((root.childNodes[0] as Text).data, 'foo');
		});
		it('Should not consider different dom nodes as the same', () => {
			const div = document.createElement('div');
			const divA = document.createElement('div');
			divA.innerHTML = 'A';
			const divB = document.createElement('div');
			divB.innerHTML = 'B';
			let vnode = d({ node: divA });
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: div, sync: true });
			let root = div.childNodes[0] as any;
			assert.strictEqual(root, divA);
			assert.strictEqual(root.innerHTML, 'A');
			vnode = d({ node: divB });
			meta.setRenderResult(vnode);
			root = div.childNodes[0] as any;
			assert.strictEqual(root, divB);
			assert.strictEqual(root.innerHTML, 'B');
		});
		it('Should run onAttach after the dom node has been appended to the dom', () => {
			let onAttachCallCount = 0;
			const myDomNode = document.createElement('div');
			const div = document.createElement('div');
			let vnode = d({
				node: myDomNode,
				onAttach: () => {
					onAttachCallCount++;
				}
			});
			const [Widget, meta] = getWidget(vnode);
			const r = renderer(() => w(Widget, {}));
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(onAttachCallCount, 1);
			meta.setRenderResult(vnode);
			assert.strictEqual(onAttachCallCount, 1);
			meta.setRenderResult(null);
			assert.strictEqual(onAttachCallCount, 1);
			meta.setRenderResult(vnode);
			assert.strictEqual(onAttachCallCount, 2);
		});
	});

	describe('deferred properties', () => {
		let createElementStub: any;

		afterEach(() => {
			if (createElementStub) {
				createElementStub.restore();
			}
		});

		it('should only set properties and attributes that have changed for deferred properties', () => {
			class Foo extends WidgetBase {
				render() {
					return v('div', () => {
						return {
							foo: 'foo'
						};
					});
				}
			}
			let setAttributeSpy: SinonSpy;
			const div = document.createElement('div');
			const r = renderer(() => w(Foo, {}));
			const originalCreateElement = document.createElement.bind(document);
			createElementStub = stub(document, 'createElement');
			createElementStub.callsFake((name: string) => {
				const element = originalCreateElement(name);
				setAttributeSpy = spy(element, 'setAttribute');
				return element;
			});
			r.mount({ domNode: div });
			assert.isTrue(setAttributeSpy!.calledOnce);
			resolvers.resolve();
			assert.isTrue(setAttributeSpy!.calledOnce);
		});

		it('can call a callback on render and on the next rAF for vnode properties', () => {
			let deferredCallbackCount = 0;
			let renderCount = 0;

			const renderFunction = () => {
				renderCount++;
				const div = v('div', (inserted) => {
					return {
						inserted,
						deferredCallbackCount: ++deferredCallbackCount,
						key: 'prop'
					};
				});
				(div.properties as any).renderCount = renderCount;
				return div;
			};

			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			const root = div.childNodes[0] as any;

			assert.strictEqual(root.deferredCallbackCount, 1);
			assert.strictEqual(root.renderCount, 1);
			assert.isFalse(root.inserted);

			// resolve the rAF so deferred properties will run
			resolvers.resolve();

			assert.strictEqual(root.deferredCallbackCount, 2);
			assert.strictEqual(root.renderCount, 1);
			assert.isTrue(root.inserted);

			meta.setRenderResult(renderFunction());
			resolvers.resolve();
			resolvers.resolve();

			assert.strictEqual(div.childNodes[0], root);
			assert.strictEqual(root.deferredCallbackCount, 4);
			assert.strictEqual(root.renderCount, 2);
			assert.isTrue(root.inserted);
		});

		it('should still allow properties to be decorated on a DNode', () => {
			let foo = 'bar';

			const renderFunction = () => {
				const div = v('div', (inserted) => {
					return {
						foo: 'this should not override the decorated property',
						another: 'property'
					};
				});
				(div.properties as any).foo = foo;
				return div;
			};

			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			const root = div.childNodes[0] as HTMLElement;

			assert.strictEqual(root.getAttribute('foo'), 'bar');
			assert.strictEqual(root.getAttribute('another'), 'property');

			// resolve the rAF so deferred properties will run
			resolvers.resolve();

			assert.strictEqual(root.getAttribute('foo'), 'bar');
			assert.strictEqual(root.getAttribute('another'), 'property');

			foo = 'qux';

			meta.setRenderResult(renderFunction());

			resolvers.resolve();

			assert.strictEqual(root.getAttribute('foo'), 'qux');
			assert.strictEqual(root.getAttribute('another'), 'property');
		});
	});

	describe('events', () => {
		it('should add an event listener', () => {
			const onclick = stub();
			const renderFunction = () => {
				return v('div', { onclick });
			};
			const [Widget] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			sendEvent(root, 'click');
			assert.isTrue(onclick.called);
		});

		it('should be able to change event listener', () => {
			const onclickFirst = stub();
			const onclickSecond = stub();
			const renderFunction = (updated?: boolean) => {
				return v('div', { onclick: updated ? onclickSecond : onclickFirst });
			};
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			sendEvent(root, 'click');
			assert.strictEqual(onclickFirst.callCount, 1);

			meta.setRenderResult(renderFunction(true));

			sendEvent(root, 'click');
			assert.strictEqual(onclickFirst.callCount, 1);
			assert.strictEqual(onclickSecond.callCount, 1);
		});

		it('should be able to drop an event listener across renders', () => {
			const onclick = stub();
			const renderFunction = (updated?: boolean) => {
				const props = updated ? {} : { onclick };
				return v('div', props);
			};
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			sendEvent(root, 'click');
			assert.strictEqual(onclick.callCount, 1);

			meta.setRenderResult(renderFunction(true));

			sendEvent(root, 'click');
			assert.strictEqual(onclick.callCount, 1);

			meta.setRenderResult(renderFunction());

			sendEvent(root, 'click');
			assert.strictEqual(onclick.callCount, 2);
		});

		it('allows one to correct the value while being typed', () => {
			let typedKeys = '';
			const handleInput = (evt: any) => {
				typedKeys = evt.target.value.substr(0, 2);
			};
			const renderFunction = () => v('input', { value: typedKeys, oninput: handleInput });
			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLInputElement;
			assert.strictEqual(root.value, typedKeys);

			root.value = 'ab';
			sendEvent(root, 'input');
			assert.strictEqual(typedKeys, 'ab');
			meta.setRenderResult(renderFunction());

			assert.strictEqual(root.value, 'ab');

			root.value = 'abc';
			sendEvent(root, 'input');
			assert.strictEqual(typedKeys, 'ab');
			meta.setRenderResult(renderFunction());

			assert.strictEqual(root.value, 'ab');
		});

		it('does not undo keystrokes, even if a browser runs an animationFrame between changing the value property and running oninput', () => {
			// Crazy internet explorer behavior
			let typedKeys = '';
			const handleInput = (evt: Event) => {
				typedKeys = (evt.target as HTMLInputElement).value;
			};

			const renderFunction = () => v('input', { value: typedKeys, oninput: handleInput });

			const [Widget, meta] = getWidget(renderFunction());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLInputElement;
			assert.strictEqual(root.value, typedKeys);

			// Normal behavior
			root.value = 'a';
			sendEvent(root, 'input');
			assert.strictEqual(typedKeys, 'a');
			meta.setRenderResult(renderFunction());

			// Crazy behavior
			root.value = 'ab';
			meta.setRenderResult(renderFunction());

			assert.strictEqual(typedKeys, 'a');
			assert.strictEqual(root.value, 'ab');
			sendEvent(root, 'input');
			assert.strictEqual(typedKeys, 'ab');
			meta.setRenderResult(renderFunction());
		});
	});

	describe('children', () => {
		it('can remove child nodes', () => {
			const [Widget, meta] = getWidget(
				v('div', [v('span', { key: 1 }), v('span', { key: 2 }), v('span', { key: 3 })])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 3);
			const firstSpan = root.childNodes[0];
			const lastSpan = root.childNodes[2];
			meta.setRenderResult(v('div', [v('span', { key: 1 }), v('span', { key: 3 })]));
			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual(root.childNodes[0], firstSpan);
			assert.strictEqual(root.childNodes[1], lastSpan);
			meta.setRenderResult(v('div', [v('span', { key: 3 })]));
			assert.lengthOf(root.childNodes, 1);
			assert.strictEqual(root.childNodes[0], lastSpan);
			meta.setRenderResult(v('div'));
			assert.lengthOf(root.childNodes, 0);
		});

		it('can add child nodes', () => {
			const [Widget, meta] = getWidget(v('div', [v('span', { key: 2 }), v('span', { key: 4 })]));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 2);
			const firstSpan = root.childNodes[0];
			const lastSpan = root.childNodes[1];

			meta.setRenderResult(
				v('div', [
					v('span', { key: 1 }),
					v('span', { key: 2 }),
					v('span', { key: 3 }),
					v('span', { key: 4 }),
					v('span', { key: 5 })
				])
			);

			assert.lengthOf(root.childNodes, 5);
			assert.strictEqual(root.childNodes[1], firstSpan);
			assert.strictEqual(root.childNodes[3], lastSpan);
		});

		it('can distinguish between string keys when adding', () => {
			const [Widget, meta] = getWidget(v('div', [v('span', { key: 'one' }), v('span', { key: 'three' })]));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 2);
			const firstSpan = root.childNodes[0];
			const secondSpan = root.childNodes[1];

			meta.setRenderResult(
				v('div', [v('span', { key: 'one' }), v('span', { key: 'two' }), v('span', { key: 'three' })])
			);

			assert.lengthOf(root.childNodes, 3);
			assert.strictEqual(root.childNodes[0], firstSpan);
			assert.strictEqual(root.childNodes[2], secondSpan);
		});

		it('can distinguish between falsy keys when replacing', () => {
			const [Widget, meta] = getWidget(
				v('div', [
					v('span', { key: false as any }),
					v('span', { key: null as any }),
					v('span', { key: '' }),
					v('span', {})
				])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;

			assert.lengthOf(root.childNodes, 4);

			const firstSpan = root.childNodes[0];
			const secondSpan = root.childNodes[1];
			const thirdSpan = root.childNodes[2];
			const fourthSpan = root.childNodes[3];

			meta.setRenderResult(v('div', [v('span', { key: 0 })]));

			assert.lengthOf(root.childNodes, 1);
			const newSpan = root.childNodes[0];

			assert.notStrictEqual(newSpan, firstSpan);
			assert.notStrictEqual(newSpan, secondSpan);
			assert.notStrictEqual(newSpan, thirdSpan);
			assert.notStrictEqual(newSpan, fourthSpan);
		});

		it('can distinguish between string keys when deleting', () => {
			const [Widget, meta] = getWidget(
				v('div', [v('span', { key: 'one' }), v('span', { key: 'two' }), v('span', { key: 'three' })])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 3);
			const firstSpan = root.childNodes[0];
			const thirdSpan = root.childNodes[2];

			meta.setRenderResult(v('div', [v('span', { key: 'one' }), v('span', { key: 'three' })]));

			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual(root.childNodes[0], firstSpan);
			assert.strictEqual(root.childNodes[1], thirdSpan);
		});

		it('can distinguish between falsy keys when deleting', () => {
			const [Widget, meta] = getWidget(
				v('div', [v('span', { key: 0 }), v('span', { key: false as any }), v('span', { key: null as any })])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;

			assert.lengthOf(root.childNodes, 3);
			const firstSpan = root.childNodes[0];
			const thirdSpan = root.childNodes[2];

			meta.setRenderResult(v('div', [v('span', { key: 0 }), v('span', { key: null as any })]));

			assert.lengthOf(root.childNodes, 2);
			assert.strictEqual(root.childNodes[0], firstSpan);
			assert.strictEqual(root.childNodes[1], thirdSpan);
		});

		it('does not reorder nodes based on keys', () => {
			const [Widget, meta] = getWidget(v('div', [v('span', { key: 'a' }), v('span', { key: 'b' })]));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;

			assert.lengthOf(root.childNodes, 2);
			const firstSpan = root.childNodes[0];
			const lastSpan = root.childNodes[1];

			meta.setRenderResult(v('div', [v('span', { key: 'b' }), v('span', { key: 'a' })]));

			assert.lengthOf(root.childNodes, 2);
			assert.notStrictEqual(root.childNodes[0], lastSpan);
			assert.notStrictEqual(root.childNodes[1], firstSpan);
		});

		it('can insert text nodes', () => {
			const [Widget, meta] = getWidget(v('div', [v('span', { key: 2 }), v('span', { key: 4 })]));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;

			assert.lengthOf(root.childNodes, 2);
			const firstSpan = root.childNodes[0];
			const lastSpan = root.childNodes[1];

			meta.setRenderResult(v('div', [v('span', { key: 2 }), 'Text between', v('span', { key: 4 })]));

			assert.lengthOf(root.childNodes, 3);

			assert.strictEqual(root.childNodes[0], firstSpan);
			assert.strictEqual(root.childNodes[2], lastSpan);
		});

		it('Can update, insert and remove only affected nodes', () => {
			const [Widget, meta] = getWidget(
				v('div', [
					v('span', { key: '1', id: '1' }),
					v('span', { key: '2', id: '2' }),
					v('span', { key: '3', id: '3' }),
					v('span', { key: '4', id: '4' }),
					v('span', { key: '5', id: '5' }),
					v('span', { key: '6', id: '6' }),
					v('span', { key: '7', id: '7' }),
					v('span', { key: '8', id: '8' }),
					v('span', { key: '9', id: '9' }),
					v('span', { key: '10', id: '10' }),
					v('span', { key: '11', id: '11' }),
					v('span', { key: '12', id: '12' })
				])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			const childOne = root.childNodes[0] as HTMLSpanElement;
			const childTwo = root.childNodes[1] as HTMLSpanElement;
			const childThree = root.childNodes[2] as HTMLSpanElement;
			const childFour = root.childNodes[3] as HTMLSpanElement;
			const childFive = root.childNodes[4] as HTMLSpanElement;
			const childSix = root.childNodes[5] as HTMLSpanElement;
			const childSeven = root.childNodes[6] as HTMLSpanElement;
			const childEight = root.childNodes[7] as HTMLSpanElement;
			const childNine = root.childNodes[8] as HTMLSpanElement;
			const childTen = root.childNodes[9] as HTMLSpanElement;
			const childEleven = root.childNodes[10] as HTMLSpanElement;
			const childTwelve = root.childNodes[11] as HTMLSpanElement;
			meta.setRenderResult(
				v('div', [
					v('span', { key: '1', id: '1' }),
					v('span', { key: '8', id: '8' }),
					v('span', { key: '9', id: '9' }),
					v('span', { key: '10', id: '10' }),
					v('span', { key: '6', id: '6' }),
					v('span', { key: '15', id: '15' }),
					v('span', { key: '16', id: '16' }),
					v('span', { key: '17', id: '17' }),
					v('span', { key: '18', id: '18' }),
					v('span', { key: '7', id: '7', href: 'href' }),
					v('span', { key: '2', id: '2' }),
					v('span', { key: '3', id: '3' }),
					v('span', { key: '4', id: '4' }),
					v('span', { key: '11', id: '11' }),
					v('span', { key: '12', id: '12' }),
					v('span', { key: '13', id: '13' })
				])
			);

			assert.lengthOf(root.childNodes, 16);
			assert.strictEqual(root.childNodes[0], childOne);
			assert.notEqual(root.childNodes[1], childTwo);
			assert.notEqual(root.childNodes[1], childEight);
			assert.notEqual(root.childNodes[2], childThree);
			assert.notEqual(root.childNodes[2], childNine);
			assert.notEqual(root.childNodes[3], childFour);
			assert.notEqual(root.childNodes[3], childTen);
			assert.isNull(childFive.parentNode);
			assert.strictEqual(root.childNodes[4], childSix);
			assert.strictEqual(root.childNodes[9], childSeven);
			assert.strictEqual((root.childNodes[9] as HTMLElement).getAttribute('href'), 'href');
			assert.notEqual(root.childNodes[10], childEight);
			assert.notEqual(root.childNodes[10], childTwo);
			assert.notEqual(root.childNodes[11], childNine);
			assert.notEqual(root.childNodes[11], childThree);
			assert.notEqual(root.childNodes[12], childTen);
			assert.notEqual(root.childNodes[12], childFour);
			assert.strictEqual(root.childNodes[13], childEleven);
			assert.strictEqual(root.childNodes[14], childTwelve);
		});

		it('Can update, insert and remove only affected nodes from widgets', () => {
			class Foo extends WidgetBase<{ id?: string; href?: string }> {
				render() {
					const { key, id, href } = this.properties;
					let properties = href ? { key, id, href } : { key, id };
					return v('span', properties);
				}
			}

			const [Widget, meta] = getWidget(
				v('div', [
					w(Foo, { key: '1', id: '1' }),
					w(Foo, { key: '2', id: '2' }),
					w(Foo, { key: '3', id: '3' }),
					w(Foo, { key: '4', id: '4' }),
					w(Foo, { key: '5', id: '5' }),
					w(Foo, { key: '6', id: '6' }),
					w(Foo, { key: '7', id: '7' }),
					w(Foo, { key: '8', id: '8' }),
					w(Foo, { key: '9', id: '9' }),
					w(Foo, { key: '10', id: '10' }),
					w(Foo, { key: '11', id: '11' }),
					w(Foo, { key: '12', id: '12' })
				])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			const childOne = root.childNodes[0] as HTMLSpanElement;
			const childTwo = root.childNodes[1] as HTMLSpanElement;
			const childThree = root.childNodes[2] as HTMLSpanElement;
			const childFour = root.childNodes[3] as HTMLSpanElement;
			const childFive = root.childNodes[4] as HTMLSpanElement;
			const childSix = root.childNodes[5] as HTMLSpanElement;
			const childSeven = root.childNodes[6] as HTMLSpanElement;
			const childEight = root.childNodes[7] as HTMLSpanElement;
			const childNine = root.childNodes[8] as HTMLSpanElement;
			const childTen = root.childNodes[9] as HTMLSpanElement;
			const childEleven = root.childNodes[10] as HTMLSpanElement;
			const childTwelve = root.childNodes[11] as HTMLSpanElement;

			meta.setRenderResult(
				v('div', [
					w(Foo, { key: '1', id: '1' }),
					w(Foo, { key: '8', id: '8' }),
					w(Foo, { key: '9', id: '9' }),
					w(Foo, { key: '10', id: '10' }),
					w(Foo, { key: '6', id: '6' }),
					w(Foo, { key: '15', id: '15' }),
					w(Foo, { key: '16', id: '16' }),
					w(Foo, { key: '17', id: '17' }),
					w(Foo, { key: '18', id: '18' }),
					w(Foo, { key: '7', id: '7', href: 'href' }),
					w(Foo, { key: '2', id: '2' }),
					w(Foo, { key: '3', id: '3' }),
					w(Foo, { key: '4', id: '4' }),
					w(Foo, { key: '11', id: '11' }),
					w(Foo, { key: '12', id: '12' }),
					w(Foo, { key: '13', id: '13' })
				])
			);

			assert.lengthOf(root.childNodes, 16);
			assert.strictEqual(root.childNodes[0], childOne);
			assert.notEqual(root.childNodes[1], childTwo);
			assert.notEqual(root.childNodes[1], childEight);
			assert.notEqual(root.childNodes[2], childThree);
			assert.notEqual(root.childNodes[2], childNine);
			assert.notEqual(root.childNodes[3], childFour);
			assert.notEqual(root.childNodes[3], childTen);
			assert.isNull(childFive.parentNode);
			assert.strictEqual(root.childNodes[4], childSix);
			assert.strictEqual(root.childNodes[9], childSeven);
			assert.strictEqual((root.childNodes[9] as HTMLElement).getAttribute('href'), 'href');
			assert.notEqual(root.childNodes[10], childEight);
			assert.notEqual(root.childNodes[10], childTwo);
			assert.notEqual(root.childNodes[11], childNine);
			assert.notEqual(root.childNodes[11], childThree);
			assert.notEqual(root.childNodes[12], childTen);
			assert.notEqual(root.childNodes[12], childFour);
			assert.strictEqual(root.childNodes[13], childEleven);
			assert.strictEqual(root.childNodes[14], childTwelve);
		});

		it('Can insert new nodes in a widget that returns an array from render', () => {
			let addExtraNodes: any = undefined;

			class A extends WidgetBase<any> {
				render() {
					if (this.properties.extra) {
						return [
							v('div', { key: '1' }, ['1']),
							v('div', { key: '2' }, ['2']),
							v('div', { key: '3' }, ['3'])
						];
					}
					return [v('div', { key: '1' }, ['1'])];
				}
			}

			class B extends WidgetBase {
				private _extraNodes = false;
				private a = () => {
					this._extraNodes = !this._extraNodes;
					this.invalidate();
				};
				constructor() {
					super();
					addExtraNodes = this.a;
				}
				render() {
					return v('div', [w(A, { extra: this._extraNodes }), w(A, {})]);
				}
			}
			const r = renderer(() => w(B, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '1');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '1');
			addExtraNodes();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '1');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '2');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '3');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, '1');
		});

		it('Can insert new nodes in a widget that returns an array from render when previously returns null', () => {
			let addExtraNodes: any = undefined;

			class A extends WidgetBase<any> {
				render() {
					if (this.properties.extra) {
						return [
							v('div', { key: '1' }, ['1']),
							v('div', { key: '2' }, ['2']),
							v('div', { key: '3' }, ['3'])
						];
					}
					return [null];
				}
			}

			class C extends WidgetBase {
				render() {
					return [
						v('div', { key: '1' }, ['4']),
						v('div', { key: '2' }, ['5']),
						v('div', { key: '3' }, ['6'])
					];
				}
			}

			class B extends WidgetBase {
				private _extraNodes = false;
				private a = () => {
					this._extraNodes = !this._extraNodes;
					this.invalidate();
				};
				constructor() {
					super();
					addExtraNodes = this.a;
				}
				render() {
					return v('div', [w(C, {}), w(A, { extra: this._extraNodes }), w(C, {})]);
				}
			}

			const r = renderer(() => w(B, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '6');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[4].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[5].childNodes[0] as Text).data, '6');
			addExtraNodes();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '6');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, '1');
			assert.strictEqual((root.childNodes[4].childNodes[0] as Text).data, '2');
			assert.strictEqual((root.childNodes[5].childNodes[0] as Text).data, '3');
			assert.strictEqual((root.childNodes[6].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[7].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[8].childNodes[0] as Text).data, '6');
		});

		it('Can insert new nodes in first widget that returns an array from render when previously returns null', () => {
			let addExtraNodes: any = undefined;

			class A extends WidgetBase<any> {
				render() {
					if (this.properties.extra) {
						return [
							v('div', { key: '1' }, ['1']),
							v('div', { key: '2' }, ['2']),
							v('div', { key: '3' }, ['3'])
						];
					}
					return [null];
				}
			}

			class C extends WidgetBase {
				render() {
					return [
						v('div', { key: '1' }, ['4']),
						v('div', { key: '2' }, ['5']),
						v('div', { key: '3' }, ['6'])
					];
				}
			}

			class B extends WidgetBase {
				private _extraNodes = false;
				private a = () => {
					this._extraNodes = !this._extraNodes;
					this.invalidate();
				};
				constructor() {
					super();
					addExtraNodes = this.a;
				}
				render() {
					return v('div', [w(A, { extra: this._extraNodes }), w(C, {})]);
				}
			}
			const r = renderer(() => w(B, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '6');
			addExtraNodes();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '1');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '2');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '3');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[4].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[5].childNodes[0] as Text).data, '6');
		});

		it('Can insert new nodes in last widget that returns an array from render when previously returns null', () => {
			let addExtraNodes: any = undefined;

			class A extends WidgetBase<any> {
				render() {
					if (this.properties.extra) {
						return [
							v('div', { key: '1' }, ['1']),
							v('div', { key: '2' }, ['2']),
							v('div', { key: '3' }, ['3'])
						];
					}
					return [null];
				}
			}

			class C extends WidgetBase {
				render() {
					return [
						v('div', { key: '1' }, ['4']),
						v('div', { key: '2' }, ['5']),
						v('div', { key: '3' }, ['6'])
					];
				}
			}

			class B extends WidgetBase {
				private _extraNodes = false;
				private a = () => {
					this._extraNodes = !this._extraNodes;
					this.invalidate();
				};
				constructor() {
					super();
					addExtraNodes = this.a;
				}
				render() {
					return v('div', [w(C, {}), w(A, { extra: this._extraNodes })]);
				}
			}
			const r = renderer(() => w(B, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '6');
			addExtraNodes();
			assert.strictEqual((root.childNodes[0].childNodes[0] as Text).data, '4');
			assert.strictEqual((root.childNodes[1].childNodes[0] as Text).data, '5');
			assert.strictEqual((root.childNodes[2].childNodes[0] as Text).data, '6');
			assert.strictEqual((root.childNodes[3].childNodes[0] as Text).data, '1');
			assert.strictEqual((root.childNodes[4].childNodes[0] as Text).data, '2');
			assert.strictEqual((root.childNodes[5].childNodes[0] as Text).data, '3');
		});

		it('can update single text nodes', () => {
			const [Widget, meta] = getWidget(v('span', ['']));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;
			assert.lengthOf(root.childNodes, 0);

			meta.setRenderResult(v('span', [undefined]));

			assert.lengthOf(root.childNodes, 0);

			meta.setRenderResult(v('span', ['f']));

			assert.lengthOf(root.childNodes, 1);

			meta.setRenderResult(v('span', [null]));

			assert.lengthOf(root.childNodes, 0);

			meta.setRenderResult(v('span', ['']));

			assert.lengthOf(root.childNodes, 0);

			meta.setRenderResult(v('span', [' ']));

			assert.lengthOf(root.childNodes, 1);
		});

		it('Assumes text node where tag is falsy and there is text in the VNode', () => {
			const textVNode: VNode = {
				tag: undefined as any,
				properties: {},
				children: undefined,
				text: 'text-node',
				type: '__VNODE_TYPE'
			};
			const [Widget, meta] = getWidget(textVNode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			let root = div.childNodes[0] as Text;
			assert.strictEqual(root.data, 'text-node');
			meta.setRenderResult({
				tag: undefined as any,
				properties: {},
				children: undefined,
				text: 'text-other',
				type: '__VNODE_TYPE'
			});
			root = div.childNodes[0] as Text;
			assert.strictEqual(root.data, 'text-other');
		});

		it('Will append text node when VNode has a domNode with no parentNode', () => {
			const domNode = document.createTextNode('text-node');
			const textVNode = {
				tag: undefined as any,
				properties: {},
				children: undefined,
				text: 'text-node',
				domNode,
				type: '__VNODE_TYPE'
			};
			const [Widget] = getWidget(textVNode);
			const r = renderer(() => w(Widget, {}));
			const root = document.createElement('div');
			r.mount({ domNode: root, sync: true });
			const textNode = root.childNodes[0] as Text;
			assert.strictEqual(textNode.data, 'text-node');
			assert.strictEqual(textNode, domNode);
		});

		it('Should ignore vnode with no tag or text', () => {
			const domNode = document.createTextNode('text-node');
			const textVNode = {
				tag: undefined as any,
				properties: {},
				children: undefined,
				text: undefined,
				domNode,
				type: '__VNODE_TYPE'
			};
			const [Widget, meta] = getWidget(textVNode);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			let textNode = div.childNodes[0] as Text;
			assert.strictEqual(textNode, domNode);
			meta.setRenderResult({ ...textVNode } as any);
			textNode = div.childNodes[0] as Text;
			assert.strictEqual(textNode, domNode);
		});

		it('allows a contentEditable tag to be altered', () => {
			let text = 'initial value';
			const handleInput = (evt: any) => {
				text = evt.currentTarget.innerHTML;
			};
			const renderDNodes = () =>
				v('div', {
					contentEditable: true,
					oninput: handleInput,
					innerHTML: text
				});
			const [Widget, meta] = getWidget(renderDNodes());
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const root = div.childNodes[0] as HTMLElement;

			root.removeChild(root.childNodes[0]);
			handleInput({ currentTarget: div.childNodes[0] as Element });
			meta.setRenderResult(renderDNodes());

			root.innerHTML = 'changed <i>value</i>';
			handleInput({ currentTarget: div.childNodes[0] as Element });
			meta.setRenderResult(renderDNodes());

			assert.strictEqual(root.innerHTML, 'changed <i>value</i>');
		});
	});

	describe('svg', () => {
		it('creates and updates svg dom nodes with the right namespace', () => {
			const [Widget, meta] = getWidget(
				v('div', [
					v('svg', [
						v('circle', { cx: '2cm', cy: '2cm', r: '1cm', fill: 'red' }),
						v('image', { href: '/image.jpeg' })
					]),
					v('span')
				])
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const svg = (div.childNodes[0] as Element).childNodes[0];
			assert.strictEqual(svg.namespaceURI, 'http://www.w3.org/2000/svg');
			const circle = svg.childNodes[0];
			assert.strictEqual(circle.namespaceURI, 'http://www.w3.org/2000/svg');
			const image = svg.childNodes[1] as HTMLImageElement;
			assert.strictEqual(image.attributes[0].namespaceURI, 'http://www.w3.org/1999/xlink');
			const span = (div.childNodes[0] as Element).childNodes[1];
			assert.strictEqual(span.namespaceURI, 'http://www.w3.org/1999/xhtml');

			meta.setRenderResult(
				v('div', [
					v('svg', [
						v('circle', { key: 'blue', cx: '2cm', cy: '2cm', r: '1cm', fill: 'blue' }),
						v('image', { href: '/image2.jpeg' })
					]),
					v('span')
				])
			);

			const blueCircle = svg.childNodes[0];
			assert.strictEqual(blueCircle.namespaceURI, 'http://www.w3.org/2000/svg');
		});

		it('should support adding and removing classes on svg dom', () => {
			const [Widget, meta] = getWidget(v('svg', { classes: ['foo'] }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			const svg = div.childNodes[0] as SVGElement;
			assert.strictEqual(svg.namespaceURI, 'http://www.w3.org/2000/svg');
			assert.strictEqual(svg.getAttribute('class'), 'foo');
			meta.setRenderResult(v('svg', { classes: ['foo', 'bar'] }));
			assert.strictEqual(svg.getAttribute('class'), 'foo bar');
			meta.setRenderResult(v('svg', { classes: [] }));
			assert.strictEqual(svg.getAttribute('class'), null);
			meta.setRenderResult(v('svg', { classes: ['bar'] }));
			assert.strictEqual(svg.getAttribute('class'), 'bar');
		});
	});

	describe('merging', () => {
		it('Supports merging DNodes onto existing HTML', () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			iframe.contentDocument!.write(
				`<div class="foo"><label for="baz">Select Me:</label><select type="text" name="baz" id="baz" disabled="disabled"><option value="foo">label foo</option><option value="bar" selected="">label bar</option><option value="baz">label baz</option></select><button type="button" disabled="disabled">Click Me!</button></div>`
			);
			iframe.contentDocument!.close();
			const root = iframe.contentDocument!.body.firstChild as HTMLElement;
			const childElementCount = root.childElementCount;
			const select = root.childNodes[1] as HTMLSelectElement;
			const button = root.childNodes[2] as HTMLButtonElement;
			assert.strictEqual(select.value, 'bar', 'bar should be selected');
			const onclickListener = spy();
			class Foo extends WidgetBase {
				render() {
					return v(
						'div',
						{
							classes: ['foo', 'bar']
						},
						[
							v(
								'label',
								{
									for: 'baz'
								},
								['Select Me:']
							),
							v(
								'select',
								{
									type: 'text',
									name: 'baz',
									id: 'baz',
									disabled: false
								},
								[
									v('option', { value: 'foo', selected: true }, ['label foo']),
									v('option', { value: 'bar', selected: false }, ['label bar']),
									v('option', { value: 'baz', selected: false }, ['label baz'])
								]
							),
							v(
								'button',
								{
									type: 'button',
									disabled: false,
									onclick: onclickListener
								},
								['Click Me!']
							)
						]
					);
				}
			}
			const r = renderer(() => w(Foo, {}));
			r.mount({ domNode: iframe.contentDocument!.body });
			assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
			assert.strictEqual(root.childElementCount, childElementCount, 'should have the same number of children');
			assert.strictEqual(select, root.childNodes[1], 'should have been reused');
			assert.strictEqual(button, root.childNodes[2], 'should have been reused');
			assert.isFalse(select.disabled, 'select should be enabled');
			assert.isFalse(button.disabled, 'button should be enabled');
			assert.strictEqual(select.value, 'foo', 'foo should be selected');
			assert.strictEqual(select.children.length, 3, 'should have 3 children');
			assert.isFalse(onclickListener.called, 'onclickListener should not have been called');
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			button.dispatchEvent(clickEvent);
			assert.isTrue(onclickListener.called, 'onclickListener should have been called');
			document.body.removeChild(iframe);
		});
		it('Supports merging DNodes with widgets onto existing HTML', () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			iframe.contentDocument!.write(
				`<div class="foo"><label for="baz">Select Me:</label><select type="text" name="baz" id="baz" disabled="disabled"><option value="foo">label foo</option><option value="bar" selected="">label bar</option><option value="baz">label baz</option></select><button type="button" disabled="disabled">Click Me!</button><span>label</span><div>last node</div></div>`
			);
			iframe.contentDocument!.close();
			const root = iframe.contentDocument!.body.firstChild as HTMLElement;
			const childElementCount = root.childElementCount;
			const label = root.childNodes[0] as HTMLLabelElement;
			const select = root.childNodes[1] as HTMLSelectElement;
			const button = root.childNodes[2] as HTMLButtonElement;
			const span = root.childNodes[3] as HTMLElement;
			const div = root.childNodes[4] as HTMLElement;
			assert.strictEqual(select.value, 'bar', 'bar should be selected');
			const onclickListener = spy();
			class Button extends WidgetBase {
				render() {
					return [
						v('button', { type: 'button', disabled: false, onclick: onclickListener }, ['Click Me!']),
						v('span', {}, ['label'])
					];
				}
			}
			class Foo extends WidgetBase {
				render() {
					return v(
						'div',
						{
							classes: ['foo', 'bar']
						},
						[
							v(
								'label',
								{
									for: 'baz'
								},
								['Select Me:']
							),
							v(
								'select',
								{
									type: 'text',
									name: 'baz',
									id: 'baz',
									disabled: false
								},
								[
									v('option', { value: 'foo', selected: true }, ['label foo']),
									v('option', { value: 'bar', selected: false }, ['label bar']),
									v('option', { value: 'baz', selected: false }, ['label baz'])
								]
							),
							w(Button, {}),
							v('div', ['last node'])
						]
					);
				}
			}
			const r = renderer(() => w(Foo, {}));
			r.mount({ domNode: iframe.contentDocument!.body });
			assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
			assert.strictEqual(root.childElementCount, childElementCount, 'should have the same number of children');
			assert.strictEqual(label, root.childNodes[0], 'should have been reused');
			assert.strictEqual(select, root.childNodes[1], 'should have been reused');
			assert.strictEqual(button, root.childNodes[2], 'should have been reused');
			assert.strictEqual(span, root.childNodes[3], 'should have been reused');
			assert.strictEqual(div, root.childNodes[4], 'should have been reused');
			assert.isFalse(select.disabled, 'select should be enabled');
			assert.isFalse(button.disabled, 'button should be enabled');
			assert.strictEqual(select.value, 'foo', 'foo should be selected');
			assert.strictEqual(select.children.length, 3, 'should have 3 children');
			assert.isFalse(onclickListener.called, 'onclickListener should not have been called');
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			button.dispatchEvent(clickEvent);
			assert.isTrue(onclickListener.called, 'onclickListener should have been called');
			document.body.removeChild(iframe);
		});
		it('Removes unknown nodes when merging', () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			iframe.contentDocument!.write(`
				<div class="foo">
					<label for="baz">Select Me:</label>
					<select type="text" name="baz" id="baz" disabled="disabled">
						<option value="foo">label foo</option>
						<option value="bar" selected="">label bar</option>
						<option value="baz">label baz</option>
					</select>
					<button type="button" disabled="disabled">Click Me!</button>
					<span>label</span>
					<div>last node</div>
				</div>`);
			iframe.contentDocument!.close();
			const root = iframe.contentDocument!.body.firstChild as HTMLElement;
			const childElementCount = root.childElementCount;
			const label = root.childNodes[1] as HTMLLabelElement;
			const select = root.childNodes[3] as HTMLSelectElement;
			const button = root.childNodes[5] as HTMLButtonElement;
			const span = root.childNodes[7] as HTMLElement;
			const div = root.childNodes[9] as HTMLElement;
			assert.strictEqual(select.value, 'bar', 'bar should be selected');
			const onclickListener = spy();
			class Button extends WidgetBase {
				render() {
					return [
						v('button', { type: 'button', disabled: false, onclick: onclickListener }, ['Click Me!']),
						v('span', {}, ['label'])
					];
				}
			}
			class Foo extends WidgetBase {
				render() {
					return v(
						'div',
						{
							classes: ['foo', 'bar']
						},
						[
							v(
								'label',
								{
									for: 'baz'
								},
								['Select Me:']
							),
							v(
								'select',
								{
									type: 'text',
									name: 'baz',
									id: 'baz',
									disabled: false
								},
								[
									v('option', { value: 'foo', selected: true }, ['label foo']),
									v('option', { value: 'bar', selected: false }, ['label bar']),
									v('option', { value: 'baz', selected: false }, ['label baz'])
								]
							),
							w(Button, {}),
							v('div', ['last node'])
						]
					);
				}
			}
			const r = renderer(() => w(Foo, {}));
			r.mount({ domNode: iframe.contentDocument!.body });
			assert.strictEqual(root.className, 'foo bar', 'should have added bar class');
			assert.strictEqual(root.childElementCount, childElementCount, 'should have the same number of children');
			assert.strictEqual(label, root.childNodes[0], 'should have been reused');
			assert.strictEqual(select, root.childNodes[1], 'should have been reused');
			assert.strictEqual(button, root.childNodes[2], 'should have been reused');
			assert.strictEqual(span, root.childNodes[3], 'should have been reused');
			assert.strictEqual(div, root.childNodes[4], 'should have been reused');
			assert.isFalse(select.disabled, 'select should be enabled');
			assert.isFalse(button.disabled, 'button should be enabled');
			assert.strictEqual(select.value, 'foo', 'foo should be selected');
			assert.strictEqual(select.children.length, 3, 'should have 3 children');
			assert.isFalse(onclickListener.called, 'onclickListener should not have been called');
			const clickEvent = document.createEvent('CustomEvent');
			clickEvent.initEvent('click', true, true);
			button.dispatchEvent(clickEvent);
			assert.isTrue(onclickListener.called, 'onclickListener should have been called');
			document.body.removeChild(iframe);
		});
		it('should replace text node on merge when value is different', () => {
			const iframe = document.createElement('iframe');
			document.body.appendChild(iframe);
			iframe.contentDocument!.write(`<div class="foo"><span>hello</span><span>world</span></div>`);
			iframe.contentDocument!.close();
			const div = iframe.contentDocument!.body.firstChild as HTMLElement;
			const firstSpan = div.childNodes[0];
			const firstText = firstSpan.childNodes[0] as Text;
			const secondSpan = div.childNodes[1] as HTMLLabelElement;
			const secondText = secondSpan.childNodes[0] as Text;
			class App extends WidgetBase {
				render() {
					return v('div', [v('span', ['hello']), v('span', ['tests'])]);
				}
			}
			const r = renderer(() => w(App, {}));
			r.mount({ domNode: iframe.contentDocument!.body });
			assert.strictEqual(div, iframe.contentDocument!.body.firstChild);
			assert.strictEqual(firstSpan, iframe.contentDocument!.body.firstChild!.childNodes[0]);
			assert.strictEqual(firstText, iframe.contentDocument!.body.firstChild!.childNodes[0].childNodes[0]);
			assert.strictEqual(secondSpan, iframe.contentDocument!.body.firstChild!.childNodes[1]);
			assert.notStrictEqual(secondText, iframe.contentDocument!.body.firstChild!.childNodes[1].childNodes[0]);
			assert.strictEqual(div.outerHTML, '<div class="foo"><span>hello</span><span>tests</span></div>');
			document.body.removeChild(iframe);
		});
	});

	describe('sync mode', () => {
		it('should run afterRenderCallbacks sync', () => {
			const [Widget, meta] = getWidget(v('div', { key: '1' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.isTrue(meta.nodeHandlerStub.add.calledWith(div.childNodes[0] as Element, '1'));
		});

		it('should run defferedRenderCallbacks sync', () => {
			let callCount = 0;
			const [Widget] = getWidget(
				v('div', () => {
					callCount++;
					return {};
				})
			);
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual(callCount, 2);
		});
	});

	describe('node callbacks', () => {
		it('element not added to node handler for nodes without a key', () => {
			const [Widget, meta] = getWidget(v('div'));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div });
			resolvers.resolve();
			meta.setRenderResult(v('div'));

			resolvers.resolve();
			assert.isTrue(meta.nodeHandlerStub.add.notCalled);
		});

		it('element added on create to node handler for nodes with a key', () => {
			const [Widget, meta] = getWidget(v('div', { key: '1' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.isTrue(meta.nodeHandlerStub.add.called);
			assert.isTrue(meta.nodeHandlerStub.add.calledWith(div.childNodes[0] as Element, '1'));
			meta.nodeHandlerStub.add.resetHistory();
			meta.setRenderResult(v('div', { key: '1' }));

			assert.isTrue(meta.nodeHandlerStub.add.called);
			assert.isTrue(meta.nodeHandlerStub.add.calledWith(div.childNodes[0] as Element, '1'));
		});

		it('element added on update to node handler for nodes with a key of 0', () => {
			const [Widget, meta] = getWidget(v('div', { key: 0 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.isTrue(meta.nodeHandlerStub.add.called);
			assert.isTrue(meta.nodeHandlerStub.add.calledWith(div.childNodes[0] as Element, '0'));
			meta.nodeHandlerStub.add.resetHistory();
			meta.setRenderResult(v('div', { key: 0 }));

			assert.isTrue(meta.nodeHandlerStub.add.called);
			assert.isTrue(meta.nodeHandlerStub.add.calledWith(div.childNodes[0] as Element, '0'));
		});

		it('addRoot called on node handler for created widgets with a zero key', () => {
			const [Widget, meta] = getWidget(v('div', { key: 0 }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.isTrue(meta.nodeHandlerStub.addRoot.called);
			meta.nodeHandlerStub.addRoot.resetHistory();
			meta.invalidate();

			assert.isTrue(meta.nodeHandlerStub.addRoot.called);
			meta.nodeHandlerStub.addRoot.resetHistory();
		});

		it('addRoot called on node handler for updated widgets with key', () => {
			const [Widget, meta] = getWidget(v('div', { key: '1' }));
			const r = renderer(() => w(Widget, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.isTrue(meta.nodeHandlerStub.addRoot.called);
			meta.nodeHandlerStub.addRoot.resetHistory();
			meta.invalidate();
			assert.isTrue(meta.nodeHandlerStub.addRoot.called);
		});
	});

	describe('animations', () => {
		describe('enterAnimation', () => {
			it('is invoked when a new node is added to an existing parent node', () => {
				const enterAnimation = stub();
				const [Widget, meta] = getWidget(v('div', []));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				meta.setRenderResult(v('div', [v('span', { enterAnimation })]));
				assert.isTrue(enterAnimation.calledWith((div.childNodes[0] as Element).childNodes[0], match({})));
			});
			it('Does not invoke transition when null passed as enterAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget] = getWidget(v('div', [v('span', { enterAnimation: null })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				assert.isTrue(transition.enter.notCalled);
			});
			it('Does not invoke transition when undefined passed as enterAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget] = getWidget(v('div', [v('span', { enterAnimation: undefined })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				assert.isTrue(transition.enter.notCalled);
			});
			it('Does not invoke transition when false passed as enterAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget] = getWidget(v('div', [v('span', { enterAnimation: false })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				assert.isTrue(transition.enter.notCalled);
			});
			it('Does not invoke transition when true passed as enterAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget] = getWidget(v('div', [v('span', { enterAnimation: true })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				assert.isTrue(transition.enter.notCalled);
			});
		});
		describe('exitAnimation', () => {
			it('is invoked when a node is removed from an existing parent node', () => {
				const exitAnimation = stub();
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true });
				meta.setRenderResult(v('div', []));
				assert.isTrue(
					exitAnimation.calledWithExactly((div.childNodes[0] as Element).childNodes[0], match({}), match({}))
				);
				assert.lengthOf((div.childNodes[0] as Element).childNodes, 1);
				exitAnimation.lastCall.callArg(1); // arg1: removeElement
				assert.lengthOf((div.childNodes[0] as Element).childNodes, 0);
			});
			it('Does not invoke transition when null passed as exitAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation: null })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				meta.setRenderResult(v('div', []));
				assert.isTrue(transition.exit.notCalled);
			});
			it('Does not invoke transition when undefined passed as exitAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation: undefined })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				meta.setRenderResult(v('div', []));
				assert.isTrue(transition.exit.notCalled);
			});
			it('Does not invoke transition when false passed as exitAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation: false })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				meta.setRenderResult(v('div', []));
				assert.isTrue(transition.exit.notCalled);
			});
			it('Does not invoke transition when true passed as exitAnimation', () => {
				const transition = {
					enter: stub(),
					exit: stub()
				};
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation: true })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition });
				meta.setRenderResult(v('div', []));
				assert.isTrue(transition.exit.notCalled);
			});
		});
		describe('transitionStrategy', () => {
			it('will be invoked when enterAnimation is provided as a string', () => {
				const transitionStrategy = { enter: stub(), exit: stub() };
				const [Widget, meta] = getWidget(v('div'));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition: transitionStrategy });
				meta.setRenderResult(v('div', [v('span', { enterAnimation: 'fadeIn' })]));
				assert.isTrue(
					transitionStrategy.enter.calledWithExactly(
						(div.childNodes[0] as Element).firstChild,
						match({}),
						'fadeIn'
					)
				);
			});
			it('will be invoked when exitAnimation is provided as a string', () => {
				const transitionStrategy = { enter: stub(), exit: stub() };
				const [Widget, meta] = getWidget(v('div', [v('span', { exitAnimation: 'fadeOut' })]));
				const r = renderer(() => w(Widget, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition: transitionStrategy });
				meta.setRenderResult(v('div', []));
				assert.isTrue(
					transitionStrategy.exit.calledWithExactly(
						(div.childNodes[0] as Element).firstChild,
						match({}),
						'fadeOut',
						match({})
					)
				);
				transitionStrategy.exit.lastCall.callArg(3);
				assert.lengthOf((div.childNodes[0] as Element).childNodes, 0);
			});
			it('Should run enter animations when a widget is added', () => {
				const transitionStrategy = { enter: stub(), exit: stub() };
				class Child extends WidgetBase {
					render() {
						return v('div', { enterAnimation: 'enter' });
					}
				}
				let addItem: any;
				class Parent extends WidgetBase {
					items = [w(Child, { key: '1' })];
					constructor() {
						super();
						addItem = this.addItem;
					}

					addItem = () => {
						this.items = [...this.items, w(Child, { key: '2' })];
						this.invalidate();
					};
					render() {
						return v('div', [...this.items]);
					}
				}
				const r = renderer(() => w(Parent, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition: transitionStrategy });
				assert.isTrue(
					transitionStrategy.enter.calledWithExactly(
						(div.childNodes[0] as Element).children[0],
						match({}),
						'enter'
					)
				);
				addItem();
				assert.isTrue(
					transitionStrategy.enter.calledWithExactly(
						(div.childNodes[0] as Element).children[1],
						match({}),
						'enter'
					)
				);
			});
			it('Should run exit animations when a widget is removed', () => {
				const transitionStrategy = { enter: stub(), exit: stub() };
				class Child extends WidgetBase {
					render() {
						return v('div', { exitAnimation: 'exit' });
					}
				}
				let removeItem: any;
				class Parent extends WidgetBase {
					items = [w(Child, { key: '1' }), w(Child, { key: '2' })];
					constructor() {
						super();
						removeItem = this.removeItem;
					}

					removeItem = () => {
						this.items = [this.items[0]];
						this.invalidate();
					};
					render() {
						return v('div', [...this.items]);
					}
				}
				const r = renderer(() => w(Parent, {}));
				const div = document.createElement('div');
				r.mount({ domNode: div, sync: true, transition: transitionStrategy });
				const node = (div.childNodes[0] as Element).children[1];
				removeItem();
				assert.isTrue(transitionStrategy.exit.calledWithExactly(node, match({}), 'exit', match({})));
			});
		});
	});

	describe('focus', () => {
		it('focus is only called once when set to true', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					focus: true
				})
			);

			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const focusSpy = spy(input, 'focus');
			resolvers.resolveRAF();
			assert.isTrue(focusSpy.calledOnce);
			resolvers.resolveRIC();
			assert.isTrue(focusSpy.calledOnce);
			meta.setRenderResult(v('input', { focus: true }));
			resolvers.resolveRAF();
			assert.isTrue(focusSpy.calledOnce);
			resolvers.resolveRIC();
			assert.isTrue(focusSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('focus is called when focus property is set to true from false', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					focus: false
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const focusSpy = spy(input, 'focus');
			resolvers.resolve();
			assert.isTrue(focusSpy.notCalled);
			meta.setRenderResult(v('input', { focus: true }));
			resolvers.resolve();
			assert.isTrue(focusSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('Should focus if function for focus returns true', () => {
			const shouldFocus = () => {
				return true;
			};
			const [Widget, meta] = getWidget(
				v('input', {
					focus: shouldFocus
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const focusSpy = spy(input, 'focus');
			resolvers.resolve();
			assert.isTrue(focusSpy.calledOnce);
			meta.setRenderResult(v('input', { focus: shouldFocus }));
			resolvers.resolve();
			assert.isTrue(focusSpy.calledTwice);
			document.body.removeChild(input);
		});

		it('Should never focus if function for focus returns false', () => {
			const shouldFocus = () => false;
			const [Widget, meta] = getWidget(
				v('input', {
					focus: shouldFocus
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const focusSpy = spy(input, 'focus');
			resolvers.resolve();
			assert.isTrue(focusSpy.notCalled);
			meta.setRenderResult(v('input', { focus: shouldFocus }));
			resolvers.resolve();
			assert.isTrue(focusSpy.notCalled);
			document.body.removeChild(input);
		});
	});

	describe('blur', () => {
		it('blur is only called once when set to true', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					blur: true
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const blurSpy = spy(input, 'blur');
			resolvers.resolve();
			assert.isTrue(blurSpy.calledOnce);
			meta.setRenderResult(v('input', { blur: true }));
			assert.isTrue(blurSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('blur is called when blur property is set to true from false', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					blur: false
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const blurSpy = spy(input, 'blur');
			resolvers.resolve();
			assert.isTrue(blurSpy.notCalled);
			meta.setRenderResult(v('input', { blur: true }));
			resolvers.resolve();
			assert.isTrue(blurSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('Should blur if function for blur returns true', () => {
			const shouldBlur = () => {
				return true;
			};
			const [Widget, meta] = getWidget(
				v('input', {
					blur: shouldBlur
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const blurSpy = spy(input, 'blur');
			resolvers.resolve();
			assert.isTrue(blurSpy.calledOnce);
			meta.setRenderResult(v('input', { blur: shouldBlur }));
			resolvers.resolve();
			assert.isTrue(blurSpy.calledTwice);
			document.body.removeChild(input);
		});

		it('Should never blur if function for blur returns false', () => {
			const shouldBlur = () => false;
			const [Widget, meta] = getWidget(
				v('input', {
					blur: shouldBlur
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const blurSpy = spy(input, 'blur');
			resolvers.resolve();
			assert.isTrue(blurSpy.notCalled);
			meta.setRenderResult(v('input', { blur: shouldBlur }));
			resolvers.resolve();
			assert.isTrue(blurSpy.notCalled);
			document.body.removeChild(input);
		});
	});

	describe('scrollIntoView', () => {
		it('scrollIntoView is only called once when set to true', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					scrollIntoView: true
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const scrollIntoViewStub = stub();
			input.scrollIntoView = scrollIntoViewStub;
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.calledOnce);
			meta.setRenderResult(v('input', { scrollIntoView: true }));
			assert.isTrue(scrollIntoViewStub.calledOnce);
			document.body.removeChild(input);
		});

		it('scrollIntoView is called when scrollIntoView property is set to true from false', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					scrollIntoView: false
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const scrollIntoViewStub = stub();
			input.scrollIntoView = scrollIntoViewStub;
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.notCalled);
			meta.setRenderResult(v('input', { scrollIntoView: true }));
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.calledOnce);
			document.body.removeChild(input);
		});

		it('Should scrollIntoView if function for scrollIntoView returns true', () => {
			const shouldScroll = () => {
				return true;
			};
			const [Widget, meta] = getWidget(
				v('input', {
					scrollIntoView: shouldScroll
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const scrollIntoViewStub = stub();
			input.scrollIntoView = scrollIntoViewStub;
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.calledOnce);
			meta.setRenderResult(v('input', { scrollIntoView: shouldScroll }));
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.calledTwice);
			document.body.removeChild(input);
		});

		it('Should never scrollIntoView if function for scrollIntoView returns false', () => {
			const shouldScroll = () => false;
			const [Widget, meta] = getWidget(
				v('input', {
					scrollIntoView: shouldScroll
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const scrollIntoViewStub = stub();
			input.scrollIntoView = scrollIntoViewStub;
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.notCalled);
			meta.setRenderResult(v('input', { scrollIntoView: shouldScroll }));
			resolvers.resolve();
			assert.isTrue(scrollIntoViewStub.notCalled);
			document.body.removeChild(input);
		});
	});

	describe('click', () => {
		it('click is only called once when set to true', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					click: true
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const clickSpy = spy(input, 'click');
			resolvers.resolve();
			assert.isTrue(clickSpy.calledOnce);
			meta.setRenderResult(v('input', { click: true }));
			assert.isTrue(clickSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('click is called when click property is set to true from false', () => {
			const [Widget, meta] = getWidget(
				v('input', {
					click: false
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const clickSpy = spy(input, 'click');
			resolvers.resolve();
			assert.isTrue(clickSpy.notCalled);
			meta.setRenderResult(v('input', { click: true }));
			resolvers.resolve();
			assert.isTrue(clickSpy.calledOnce);
			document.body.removeChild(input);
		});

		it('Should click if function for click returns true', () => {
			const shouldClick = () => {
				return true;
			};
			const [Widget, meta] = getWidget(
				v('input', {
					click: shouldClick
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const clickSpy = spy(input, 'click');
			resolvers.resolve();
			assert.isTrue(clickSpy.calledOnce);
			meta.setRenderResult(v('input', { click: shouldClick }));
			resolvers.resolve();
			assert.isTrue(clickSpy.calledTwice);
			document.body.removeChild(input);
		});

		it('Should never click if function for click returns false', () => {
			const shouldClick = () => false;
			const [Widget, meta] = getWidget(
				v('input', {
					click: shouldClick
				})
			);
			const r = renderer(() => w(Widget, {}));
			r.mount();
			const input = document.body.lastChild as HTMLElement;
			const clickSpy = spy(input, 'click');
			resolvers.resolve();
			assert.isTrue(clickSpy.notCalled);
			meta.setRenderResult(v('input', { click: shouldClick }));
			resolvers.resolve();
			assert.isTrue(clickSpy.notCalled);
			document.body.removeChild(input);
		});
	});

	describe('selects', () => {
		it('should set initial select value', () => {
			const r = renderer(() =>
				v('select', { value: 'a' }, [
					v('option'),
					v('option', { value: 'a' }, ['a']),
					v('option', { value: 'b' }, ['b'])
				])
			);

			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.children[0] as any).value, 'a');
		});

		it('should support changing the select value', () => {
			let change: any;
			class Select extends WidgetBase {
				constructor() {
					super();
					change = this.change.bind(this);
				}

				value = '';
				change(event: any) {
					this.value = event.target.value;
					this.invalidate();
				}
				render() {
					return v('select', { onchange: this.change, value: this.value }, [
						v('option', { value: '' }),
						v('option', { value: 'a' }, ['a']),
						v('option', { value: 'b' }, ['b'])
					]);
				}
			}

			const r = renderer(() => w(Select, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.children[0] as any).value, '');
			// set the value as this is what happens when the select is click in the browser
			(div.children[0] as any).value = 'a';
			change({ target: { value: 'a' } });
			assert.strictEqual((div.children[0] as any).value, 'a');
			// set the value as this is what happens when the select is click in the browser
			(div.children[0] as any).value = 'b';
			change({ target: { value: 'b' } });
			assert.strictEqual((div.children[0] as any).value, 'b');
		});

		it('should support changing the select value - programmatically', () => {
			let change: any;
			class Select extends WidgetBase {
				constructor() {
					super();
					change = this.change.bind(this);
				}

				value = '';
				change(event: any) {
					this.value = event.target.value;
					this.invalidate();
				}
				render() {
					return v('select', { onchange: this.change, value: this.value }, [
						v('option', { value: '' }),
						v('option', { value: 'a' }, ['a']),
						v('option', { value: 'b' }, ['b'])
					]);
				}
			}

			const r = renderer(() => w(Select, {}));
			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.children[0] as any).value, '');
			change({ target: { value: 'a' } });
			assert.strictEqual((div.children[0] as any).value, 'a');
			change({ target: { value: 'b' } });
			assert.strictEqual((div.children[0] as any).value, 'b');
		});

		it('should support multi-select selects', () => {
			const r = renderer(() =>
				v('select', { key: 'multi', multiple: true }, [
					v('option', { key: 'a', value: 'a', selected: true }, ['a']),
					v('option', { key: 'b', value: 'b', selected: true }, ['b']),
					v('option', { key: 'c', value: 'c' }, ['c'])
				])
			);

			const div = document.createElement('div');
			r.mount({ domNode: div, sync: true });
			assert.strictEqual((div.childNodes[0].childNodes[0] as any).selected, true);
			assert.strictEqual((div.childNodes[0].childNodes[1] as any).selected, true);
			assert.strictEqual((div.childNodes[0].childNodes[2] as any).selected, false);
		});
	});

	it('i18n Mixin', () => {
		let changeRtl: any;
		class MyWidget extends I18nMixin(WidgetBase) {
			render() {
				return v('span');
			}
		}

		class App extends WidgetBase {
			private _rtl: boolean | undefined = undefined;
			constructor() {
				super();
				changeRtl = (rtl?: boolean) => {
					this._rtl = rtl;
					this.invalidate();
				};
			}
			render() {
				return w(MyWidget, { rtl: this._rtl });
			}
		}
		const r = renderer(() => w(App, {}));
		const div = document.createElement('div');
		r.mount({ domNode: div, sync: true });
		const root = div.childNodes[0] as HTMLElement;
		assert.strictEqual(root.dir, '');
		changeRtl(true);
		assert.strictEqual(root.dir, 'rtl');
		changeRtl(false);
		assert.strictEqual(root.dir, 'ltr');
	});

	it('widget methods are bound correctly', () => {
		const stubby = stub();
		class Bar extends WidgetBase<any> {
			render() {
				this.properties.func();
				return 'blah';
			}
		}
		class Foo extends WidgetBase {
			private _stub = stubby;

			protected test() {
				this._stub();
			}
		}

		class FooSubClass extends Foo {
			render() {
				return w(Bar, { func: this.test });
			}
		}

		const r = renderer(() => w(FooSubClass, {}));
		const root: any = document.createElement('div');
		r.mount({ domNode: root });
		assert.isTrue(stubby.calledOnce);
	});
});
