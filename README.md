# tool-dynamic-component-ang15

## Использование в https://github.com/kurguzoffvlad/tool-libs-ang15

Небольшая библиотека для **динамического создания компонентов** в Angular 15+.
Даёт простой API поверх `ViewContainerRef.createComponent()`: установка `@Input`,
подписка на `@Output` с автоматической отпиской, управление созданными
компонентами (удаление одного / очистка всех).

Не требует `ComponentFactoryResolver` — используется современный API Angular 15+.

## Установка

```bash
npm install tool-dynamic-component-ang15
```

Требуется Angular 15.2+ (`@angular/core`, `@angular/common` — peer dependencies).

## Зачем это нужно

Стандартный `ViewContainerRef.createComponent()` умеет создавать компонент,
но с ним неудобно:

- передавать `@Input` (нужно вручную вызывать `ngOnChanges`, следить за `OnPush`);
- подписываться на `@Output` и не забывать отписываться (иначе утечки);
- помнить, какие компоненты созданы, чтобы потом точечно удалить;
- корректно чистить контейнер (`destroy()` vs `clear()`).

Библиотека инкапсулирует всё это в одном сервисе.

## Быстрый старт

### 1. Импортируйте директиву

```ts
import { ToolDynamicComponentAng15Module } from 'tool-dynamic-component-ang15';

@NgModule({
  imports: [
    // ...
    ToolDynamicComponentAng15Module,
  ],
})
export class AppModule {}
```

Для standalone-компонентов — импортируйте `DynamicSlotDirective` напрямую:

```ts
import { DynamicSlotDirective } from 'tool-dynamic-component-ang15';

@Component({
  standalone: true,
  imports: [DynamicSlotDirective],
  // ...
})
export class MyComponent {}
```

### 2. Поставьте якорь в шаблоне

```html
<!-- my.component.html -->
<ng-container dynSlot></ng-container>
```

`<ng-container>` не создаёт DOM-узел — это только место, куда Angular будет
вставлять динамические компоненты.

### 3. Получите `ViewContainerRef` через `@ViewChild`

```ts
import { Component, ViewChild, inject } from '@angular/core';
import {
  DynamicSlotDirective,
  ToolDynamicComponentAng15Service,
} from 'tool-dynamic-component-ang15';
import { UserCardComponent } from './user-card.component';

@Component({
  selector: 'app-my',
  templateUrl: './my.component.html',
})
export class MyComponent {
  @ViewChild(DynamicSlotDirective, { static: true })
  slot!: DynamicSlotDirective;

  private dyn = inject(ToolDynamicComponentAng15Service);

  ngOnInit() {
    this.dyn.create(UserCardComponent, this.slot.vcr, {
      inputs: { name: 'Иван' },
      outputs: {
        clicked: (id: number) => console.log('clicked', id),
      },
    });
  }
}
```

Готово — `UserCardComponent` отрендерен в месте якоря.

## API

### `ToolDynamicComponentAng15Service`

| Метод | Описание |
|---|---|
| `create(component, vcr, opts?)` | Создаёт компонент в контейнере, возвращает `ComponentRef` |
| `remove(vcr, ref)` | Удаляет один конкретный компонент |
| `clear(vcr)` | Удаляет все компоненты из контейнера |
| `get(vcr)` | Возвращает массив созданных `ComponentRef` в контейнере |

### `CreateOptions`

```ts
interface CreateOptions {
  inputs?: Record<string, unknown>;               // @Input() значения
  outputs?: Record<string, (event: any) => void>; // @Output() подписки
  multi?: boolean;                                // true — не очищать контейнер
}
```

- **`inputs`** — устанавливаются через `ref.setInput()`. Это корректно вызывает
  `ngOnChanges` и работает с `ChangeDetectionStrategy.OnPush`.
- **`outputs`** — подписки автоматически снимаются при `destroy()` компонента
  (утечек нет).
- **`multi`** — по умолчанию `false`, т.е. перед созданием контейнер очищается.
  Поставьте `true`, чтобы добавлять компоненты друг за другом.

### `DynamicSlotDirective`

Директива-якорь `[dynSlot]`. Единственная задача — достать `ViewContainerRef`
из конструктора и отдать его наружу:

```ts
@Directive({ selector: '[dynSlot]', standalone: true })
export class DynamicSlotDirective {
  constructor(public readonly vcr: ViewContainerRef) {}
}
```

## Примеры

### Один компонент с inputs

```ts
this.dyn.create(UserCardComponent, this.slot.vcr, {
  inputs: { name: 'Мария', age: 25 },
});
```

### Несколько компонентов подряд

```ts
for (const user of users) {
  this.dyn.create(UserCardComponent, this.slot.vcr, {
    inputs: { name: user.name },
    multi: true, // не очищать контейнер перед каждым create
  });
}
```

### Подписка на output

```ts
const ref = this.dyn.create(UserCardComponent, this.slot.vcr, {
  inputs: { name: 'Иван' },
  outputs: {
    clicked: (id: number) => console.log('user clicked', id),
  },
});
```

### Удаление одного компонента

```ts
this.dyn.remove(this.slot.vcr, ref);
```

### Очистка всех

```ts
this.dyn.clear(this.slot.vcr);
```

## Как это устроено

- **`WeakMap<ViewContainerRef, ComponentRef[]>`** внутри сервиса хранит список
  созданных компонентов для каждого контейнера. Когда контейнер уничтожается
  (например, разрушается компонент-хозяин), записи собираются GC автоматически.
- **`ref.onDestroy(() => sub.unsubscribe())`** — подписки на `@Output`
  снимаются вместе с уничтожением компонента.
- **`remove()`** вызывает и `vcr.remove()`, и `ref.destroy()` — это корректно
  триггерит `ngOnDestroy` дочернего компонента (в отличие от простого удаления
  DOM-узла).
- **`createComponent()` без `ComponentFactoryResolver`** — современный API
  Angular 15+.

## Ограничения

- Для установки `@Input` используется `ref.setInput()`. Если ваш компонент
  использует `@Input`-сеттеры или `ngOnChanges`, они отработают корректно.
- `outputs` работает с `EventEmitter`-полями, у которых есть метод `subscribe()`.
  Если output объявлен через `output()`-функцию (Angular 17+), `.subscribe()`
  также доступен.
- Сервис не управляет `ChangeDetectionStrategy` — при `OnPush` на компоненте-
  хозяине нужно вручную вызывать `ChangeDetectorRef.markForCheck()` после
  `create`, если данные меняются асинхронно.

## Разработка

### Сборка

```bash
ng build tool-dynamic-component-ang15
```

Артефакты — в `dist/tool-dynamic-component-ang15`.

### Публикация

```bash
ng build tool-dynamic-component-ang15
cd dist/tool-dynamic-component-ang15
npm publish
```

### Тесты

```bash
ng test tool-dynamic-component-ang15
```

### Генерация кода

```bash
ng generate component component-name --project tool-dynamic-component-ang15
ng generate service service-name --project tool-dynamic-component-ang15
```

## Лицензия

MIT
