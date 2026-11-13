import { ComponentRef, Injectable, Type, ViewContainerRef } from '@angular/core';

/** Опции создания компонента. */
export interface CreateOptions {
	inputs?: Record<string, unknown>;               // @Input() значения
	outputs?: Record<string, (event: any) => void>; // @Output() подписки
	multi?: boolean;                                // true — не очищать контейнер
}

/**
 * Сервис динамического создания компонентов Angular 15+.
 *
 * ─── Как получить ViewContainerRef ────────────────────────────────
 * В шаблон ставится <ng-container> с кастомной директивой-якорем:
 *
 *     <ng-container dynSlot></ng-container>
 *
 * Директива в конструкторе получает ViewContainerRef:
 *
 *     @Directive({ selector: '[dynSlot]' })
 *     export class DynamicSlotDirective {
 *       constructor(public vcr: ViewContainerRef) {}
 *     }
 *
 * Через @ViewChild(DynamicSlotDirective) в компоненте-хозяине
 * достаём этот vcr и передаём в create(component, vcr, opts).
 * <ng-container> не создаёт DOM-узел — только место в шаблоне.
 *
 * ─── Зачем нужен именно ViewContainerRef ─────────────────────────
 * Angular не даёт «вставить» компонент в обычный DOM-узел:
 * createComponent() есть ТОЛЬКО у ViewContainerRef. DOM-элемент
 * умеет лишь держать разметку (appendChild и т.п.), но не управляет
 * views и жизненным циклом компонентов.
 *
 * ─── Что инкапсулирует сервис ────────────────────────────────────
 *   • createComponent() + setInput() для inputs (корректно с OnPush/ngOnChanges);
 *   • подписка на outputs с авто-отпиской при destroy (без утечек);
 *   • учёт созданных компонентов в WeakMap<ViewContainerRef, ComponentRef[]>,
 *     чтобы уметь точечно удалять (remove) или чистить всё (clear);
 *   • WeakMap => при уничтожении контейнера записи собираются GC сами.
 *
 * ─── Жизненный цикл ──────────────────────────────────────────────
 * destroy() у ComponentRef корректно триггерит ngOnDestroy и снимает
 * подписки — в отличие от простого удаления DOM-узла.
 *
 * Ключевая идея: ViewContainerRef — «прораб», управляющий жизнью views;
 * DOM-элемент — лишь «полка» для разметки, createComponent не умеет.
 */
@Injectable({ providedIn: 'root' })
export class ToolDynamicComponentAng15Service {

	// WeakMap: когда контейнер уничтожается, записи собираются GC автоматически.
	private readonly refs = new WeakMap<ViewContainerRef, ComponentRef<any>[]>();

	/** Создаёт компонент в контейнере и возвращает ссылку на него. */
	create<C>(component: Type<C>, vcr: ViewContainerRef, opts: CreateOptions = {}): ComponentRef<C> {
		// По умолчанию заменяем содержимое контейнера.
		if (!opts.multi) this.clear(vcr);

		// Angular 15: createComponent без ComponentFactoryResolver.
		const ref = vcr.createComponent(component);

		// inputs через setInput — корректно вызывает ngOnChanges и работает с OnPush.
		for (const [key, value] of Object.entries(opts.inputs ?? {})) {
			ref.setInput(key, value);
		}

		// outputs: подписываемся и снимаем подписку при destroy.
		for (const [key, handler] of Object.entries(opts.outputs ?? {})) {
			const emitter = (ref.instance as any)[key];
			if (emitter?.subscribe) {
				const sub = emitter.subscribe(handler);
				ref.onDestroy(() => sub.unsubscribe());
			}
		}

		// Запоминаем ссылку, чтобы уметь удалять.
		const list = this.refs.get(vcr) ?? [];
		list.push(ref);
		this.refs.set(vcr, list);

		return ref;
	}

	/** Удаляет один конкретный компонент. */
	remove(vcr: ViewContainerRef, ref: ComponentRef<any>): void {
		const list = this.refs.get(vcr);
		const index = list?.indexOf(ref) ?? -1;
		if (!list || index === -1) return;

		vcr.remove(vcr.indexOf(ref.hostView)); // убрать из шаблона
		ref.destroy();                          // уничтожить компонент
		list.splice(index, 1);                  // убрать из реестра
	}

	/** Удаляет все компоненты из контейнера. */
	clear(vcr: ViewContainerRef): void {
		(this.refs.get(vcr) ?? []).forEach(ref => ref.destroy());
		this.refs.set(vcr, []);
		vcr.clear();
	}

	/** Возвращает список созданных компонентов в контейнере. */
	get(vcr: ViewContainerRef): ComponentRef<any>[] {
		return this.refs.get(vcr) ?? [];
	}
}
