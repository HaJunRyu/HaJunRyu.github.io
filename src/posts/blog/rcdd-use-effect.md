---
title: "useEffect의 내부동작"
category: "RCDD"
date: "2024-05-06 02:08:00 +09:00"
desc: "useEffect의 내부동작에 대해 알아보자"
thumbnail: "./images/rcdd/RCDD-thumbnail.png"
alt: "React Core Deep Dive"
---

> jser.dev 블로그의 [useEffect](https://jser.dev/2023-07-08-how-does-useeffect-work) 챕터를 보며 번역하고 이해한것을 정리하였습니다.  
> 해당 글에서 사용된 이미지들도 모두 위 블로그에서 작성된것을 사용하였습니다.

`useEffect()`는 `useState()`를 제외한다면 React에서 가장 많이 사용되는 hook일 수 있다. 매우 유용하게 사용할 수 있지만 가끔은 개발자의 의도와는 다른 동작으로 인해 혼란을 겪을때도 있다. 지금부터 `useEffect()`가 내부적으로 어떻게 작동하는지 알아보자.

## 1. Initial mount에서의 `useEffect()`

`useEffect()`는 initial mount시 `mountEffect()`를 사용한다.

```tsx
function mountEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return mountEffectImpl(
    // 해당 flag는 layout effect와의 차이점을 알려주는 중요한 요소이다.
    PassiveEffect | PassiveStaticEffect,
    HookPassive,
    create,
    deps,
  )
}
function mountEffectImpl(fiberFlags, hookFlags, create, deps): void {
  // 해당 구문에서 새로운 hook을 생성한다.
  const hook = mountWorkInProgressHook()

  const nextDeps = deps === undefined ? null : deps
  currentlyRenderingFiber.flags |= fiberFlags
  // pushEffect()는 Effect 객체를 생성한 후 이를 hook.
  // memoizedState에 할당한다. 다음 코드블럭에서 pushEffect()를 더 자세히 살펴보자.
  hook.memoizedState = pushEffect(
    // HookHasEffect flag는 initial mount시에 해당 effect를 실행해야 함을 의미하는 중요한 요소이다.
    HookHasEffect | hookFlags,
    create,
    undefined,
    nextDeps,
  )
}
```

```tsx
function pushEffect(tag, create, destroy, deps) {
  const effect: Effect = {
    // effect 객체에서 tag는 해당 effect의 실행 여부를 결정하는 중요한 요소이다.
    tag,
    // useEffect() 사용시 전달하는 callback function이다.
    create,
    // callback function에서 return된 cleanup function이다.
    destroy,
    // useEffect() 사용시 전달하는 deps array이다.
    deps,
    // Circular
    // 하나의 component에 여러개의 effect가 있을 수 있다.
    next: (null: any),
  };
  let componentUpdateQueue: null | FunctionComponentUpdateQueue = (currentlyRenderingFiber.updateQueue: any);
  if (componentUpdateQueue === null) {
    componentUpdateQueue = createFunctionComponentUpdateQueue();
    // effect는 fiber의 updateQueue에 저장된다. 이는 hook의 memoizedState와 다르다.
    currentlyRenderingFiber.updateQueue = (componentUpdateQueue: any);

    componentUpdateQueue.lastEffect = effect.next = effect;
  } else {
    const lastEffect = componentUpdateQueue.lastEffect;
    if (lastEffect === null) {
      componentUpdateQueue.lastEffect = effect.next = effect;
    } else {
      const firstEffect = lastEffect.next;
      lastEffect.next = effect;
      effect.next = firstEffect;
      componentUpdateQueue.lastEffect = effect;
    }
  }
  return effect;
}
```

Initial mount의 경우 useEffect()가 필요한 flag들을 사용하여 Effect 객체를 생성하는 것을 볼 수 있다.

## 2. Re-render에서의 `useEffect()`

```tsx
function updateEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  return updateEffectImpl(PassiveEffect, HookPassive, create, deps)
}
function updateEffectImpl(fiberFlags, hookFlags, create, deps): void {
  // current의 hook을 가져온다.
  const hook = updateWorkInProgressHook()

  const nextDeps = deps === undefined ? null : deps
  let destroy = undefined
  if (currentHook !== null) {
    // effect hook의 memoizedState가 effect 객체라는걸 기억하자.
    const prevEffect = currentHook.memoizedState

    destroy = prevEffect.destroy
    if (nextDeps !== null) {
      const prevDeps = prevEffect.deps
      // deps가 변경되지 않으면 해당 구문에서는 effect 객체를
      // 다시 생성하는것 외에는 아무 동작도 하지 않는다.
      // 왜냐하면 단순히 updateQueue()를 다시 생성하고 업데이트 된
      // create()를 가져와야 하기 때문이다.
      // 여기서 사용하고 있는 destroy는 revEffect의 destroy인 점을 유의하자.
      if (areHookInputsEqual(nextDeps, prevDeps)) {
        hook.memoizedState = pushEffect(hookFlags, create, destroy, nextDeps)
        return
      }
    }
  }
  currentlyRenderingFiber.flags |= fiberFlags
  hook.memoizedState = pushEffect(
    // deps가 변경되면 HookHasEffect flag는 해당 effect를 실행해야 함을 표시한다.
    HookHasEffect | hookFlags,
    create,
    destroy,
    nextDeps,
  )
}
```

위 코드에서 deps array가 어떻게 작동하는지 볼 수 있었다. re-render 될때 deps가 변경되면 생성된 effect가 이전 cleanup function을 사용하여 실행되도록 표시된다는 점을 제외하면 무슨 일이 있어도 effect 객체를 다시 생성한다.
