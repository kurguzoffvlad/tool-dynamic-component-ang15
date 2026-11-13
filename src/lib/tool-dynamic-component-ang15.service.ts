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
 * Зачем: Angular не даёт «вставить» компонент в обычный DOM-узел —
 * для этого нужен ViewContainerRef (место в шаблоне, обычно через
 * директиву на <ng-container>). Сервис инкапсулирует рутину:
 *
 *   • createComponent() + setInput() для inputs (корректно с OnPush/ngOnChanges);
 *   • подписка на outputs с авто-отпиской при destroy (без утечек);
 *   • учёт созданных компонентов в WeakMap<ViewContainerRef, ComponentRef[]>,
 *     чтобы уметь точечно удалять (remove) или чистить всё (clear);
 *   • WeakMap => при уничтожении контейнера записи собираются GC сами.
 *
 * Жизненный цикл: destroy() у ComponentRef корректно триггерит ngOnDestroy
 * и снимает подписки — в отличие от простого удаления DOM-узла.
 *
 * Ключевая идея: ViewContainerRef — «прораб», управляющий жизнью views;
 * DOM-элемент — лишь «полка» для разметки и createComponent не умеет.
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
