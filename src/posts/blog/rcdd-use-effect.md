---
title: "useEffect의 내부동작"
category: "RCDD"
date: "2024-05-06 02:08:00 +09:00"
desc: "useEffect의 내부동작에 대해 알아보자"
thumbnail: "./images/rcdd/RCDD-thumbnail.png"
alt: "React Core Deep Dive"
---

> jser.dev 블로그의 [useEffect](https://jser.dev/2023-07-08-how-does-useeffect-work) 챕터를 보며 번역하고 이해한것을 정리하였습니다.

`useEffect()`는 `useState()`를 제외한다면 React에서 가장 많이 사용되는 hook일 수 있다. 매우 유용하게 사용할 수 있지만 가끔은 개발자의 의도와는 다른 동작으로 인해 혼란을 겪을때도 있다. 지금부터 `useEffect()`가 내부적으로 어떻게 작동하는지 알아보자.

## 1. Initial mount에서의 `useEffect()`

`useEffect()`는 initial mount시 `mountEffect()`를 호출한다. 아래 코드를 보며 `mountEffect()`가 어떻게 동작하는지 살펴보자.

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
  // pushEffect()는 Effect 객체를 생성한 후 이를 hook.memoizedState에
  // 할당한다. 다음 코드블럭에서 pushEffect()를 더 자세히 살펴보자.
  hook.memoizedState = pushEffect(
    // HookHasEffect flag는 initial mount시에
    // 해당 effect를 실행해야 함을 의미하는 중요한 요소이다.
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

## 3. effect는 언제 실행되고 cleanup 되는가

위 내용을 기반으로 우리는 이제 `useEffect()`가 단지 Fiber Node에 추가 데이터 구조를 생성한다는 것을 알고있다. 이제 우리는 Effect 객체가 어떻게 처리되는지 알아야한다.

### 3.1 flush passive effects는 `commitRoot()`에서 trigger 된다.

두 Fiber Tree를 비교하여 결과를 얻은 후 commit phase에서 host DOM에 대한 변경 사항을 반영한다. flush passive effects를 쉽게 찾을 수 있다.

```tsx
function commitRootImpl(
  root: FiberRoot,
  recoverableErrors: null | Array<CapturedValue<mixed>>,
  transitions: Array<Transition> | null,
  renderPriorityLevel: EventPriority,
) {
  // If there are pending passive effects, schedule a callback to process them.
  // Do this as early as possible, so it is queued before anything else that
  // might get scheduled in the commit phase. (See #16714.)
  // TODO: Delete all other places that schedule the passive effect callback
  // They're redundant.
  if (
    (finishedWork.subtreeFlags & PassiveMask) !== NoFlags ||
    (finishedWork.flags & PassiveMask) !== NoFlags
  ) {
    if (!rootDoesHavePassiveEffects) {
      rootDoesHavePassiveEffects = true;
      pendingPassiveEffectsRemainingLanes = remainingLanes;
      // workInProgressTransitions might be overwritten, so we want
      // to store it in pendingPassiveTransitions until they get processed
      // We need to pass this through as an argument to commitRoot
      // because workInProgressTransitions might have changed between
      // the previous render and commit if we throttle the commit
      // with setTimeout
      pendingPassiveTransitions = transitions;
      scheduleCallback(NormalSchedulerPriority, () => {
        // 여기는 useEffect()에 의해 생성된 flushPassiveEffects이다.
        // 이는 즉시가 아니라 다음 틱에서 flush를 예약한다.
        flushPassiveEffects();
        // This render triggered passive effects: release the root cache pool
        // *after* passive effects fire to avoid freeing a cache pool that may
        // be referenced by a node in the tree (HostRoot, Cache boundary etc)
        return null;
      });
    }
  }
  ...
}
```

### 3.2 `flushPassiveEffects()`

```tsx
function flushPassiveEffectsImpl() {
  if (rootWithPendingPassiveEffects === null) {
    return false;
  }
  // Cache and clear the transitions flag
  const transitions = pendingPassiveTransitions;
  pendingPassiveTransitions = null;
  const root = rootWithPendingPassiveEffects;
  const lanes = pendingPassiveEffectsLanes;
  rootWithPendingPassiveEffects = null;
  // TODO: This is sometimes out of sync with rootWithPendingPassiveEffects.
  // Figure out why and fix it. It's not causing any known issues (probably
  // because it's only used for profiling), but it's a refactor hazard.
  pendingPassiveEffectsLanes = NoLanes;
  const prevExecutionContext = executionContext;
  executionContext |= CommitContext;
  // 여기서는 callback이 실행되기 전에 effect cleanup이 먼저 실행되는 것을 명확하게 볼 수 있다.
  commitPassiveUnmountEffects(root.current);
  commitPassiveMountEffects(root, root.current, lanes, transitions);
  ...
}
```

### 3.3 `commitPassiveUnmountEffects()`

```tsx
export function commitPassiveUnmountEffects(finishedWork: Fiber): void {
  setCurrentDebugFiberInDEV(finishedWork);
  commitPassiveUnmountOnFiber(finishedWork);
  resetCurrentDebugFiberInDEV();
}
function commitPassiveUnmountOnFiber(finishedWork: Fiber): void {
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      // children의 effects가 먼저 cleanup 된 것을 볼 수 있다.
      recursivelyTraversePassiveUnmountEffects(finishedWork);

      if (finishedWork.flags & Passive) {
        commitHookPassiveUnmountEffects(
          finishedWork,
          finishedWork.return,
          // 해당 flag는 deps가 변경되지 않으면 callback이 실행되지 않도록 한다.
          HookPassive | HookHasEffect,
        );
      }
      break;
    }
    ...
  }
}
function commitHookPassiveUnmountEffects(
  finishedWork: Fiber,
  nearestMountedAncestor: null | Fiber,
  hookFlags: HookFlags,
) {
  if (shouldProfile(finishedWork)) {
    startPassiveEffectTimer();
    commitHookEffectListUnmount(
      hookFlags,
      finishedWork,
      nearestMountedAncestor,
    );
    recordPassiveEffectDuration(finishedWork);
  } else {
    commitHookEffectListUnmount(
      hookFlags,
      finishedWork,
      nearestMountedAncestor,
    );
  }
}
function commitHookEffectListUnmount(
  flags: HookFlags,
  finishedWork: Fiber,
  nearestMountedAncestor: Fiber | null,
) {
  const updateQueue: FunctionComponentUpdateQueue | null =
    (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Unmount
        const inst = effect.inst;
        const destroy = inst.destroy;
        if (destroy !== undefined) {
          inst.destroy = undefined;
          safelyCallDestroy(finishedWork, nearestMountedAncestor, destroy);
        }
      }
      effect = effect.next;
      // 여기서는 updateQueue의 모든 Effect를 반복하고
      // flag별로 필요한 것을 필터링한다.
    } while (effect !== firstEffect);
  }
}
function safelyCallDestroy(
  current: Fiber,
  nearestMountedAncestor: Fiber | null,
  destroy: () => void,
) {
  try {
    destroy();
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
}
```

### 3.4 `commitPassiveMountEffects()`

`commitPassiveMountEffects()`도 같은 방식으로 작동한다.

```tsx
export function commitPassiveMountEffects(
  root: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
): void {
  setCurrentDebugFiberInDEV(finishedWork);
  commitPassiveMountOnFiber(
    root,
    finishedWork,
    committedLanes,
    committedTransitions,
  );
  resetCurrentDebugFiberInDEV();
}
function commitPassiveMountOnFiber(
  finishedRoot: FiberRoot,
  finishedWork: Fiber,
  committedLanes: Lanes,
  committedTransitions: Array<Transition> | null,
): void {
  // When updating this function, also update reconnectPassiveEffects, which does
  // most of the same things when an offscreen tree goes from hidden -> visible,
  // or when toggling effects inside a hidden tree.
  const flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case FunctionComponent:
    case ForwardRef:
    case SimpleMemoComponent: {
      // children의 effects가 먼저 실행되는 것을 볼 수 있다.
      recursivelyTraversePassiveMountEffects(
        finishedRoot,
        finishedWork,
        committedLanes,
        committedTransitions,
      );
      if (flags & Passive) {
        commitHookPassiveMountEffects(
          finishedWork,
          // 해당 flag는 deps가 변경되지 않으면 callback이 실행되지 않도록 한다.
          HookPassive | HookHasEffect,
        );
      }
      break;
    }
    ...
  }
}
function commitHookPassiveMountEffects(
  finishedWork: Fiber,
  hookFlags: HookFlags,
) {
  if (shouldProfile(finishedWork)) {
    startPassiveEffectTimer();
    try {
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
    recordPassiveEffectDuration(finishedWork);
  } else {
    try {
      commitHookEffectListMount(hookFlags, finishedWork);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}
function commitHookEffectListMount(flags: HookFlags, finishedWork: Fiber) {
  const updateQueue: FunctionComponentUpdateQueue | null =
    (finishedWork.updateQueue: any);
  const lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
  if (lastEffect !== null) {
    const firstEffect = lastEffect.next;
    let effect = firstEffect;
    do {
      if ((effect.tag & flags) === flags) {
        // Mount
        const create = effect.create;
        const inst = effect.inst;
        // callback은 해당 구문에서 호출된다.
        const destroy = create();

        inst.destroy = destroy;
      }
      effect = effect.next;
      // 다시 필요한 effect를 실행하고 필터링하고 실행한다.
    } while (effect !== firstEffect);
  }
}

```

## 4. Summary

코드를 살펴보니 `useEffect()`의 내부 로직은 비교적 단순하다. 글로 한번 정리해보자.

1. `useEffect()`는 Fiber에 저장되는 Effect 객체를 생성한다.
   - Effect에는 실행이 필요한지 여부를 나타내는 `tag`가 있다.
   - Effect에는 우리가 전달하는 첫 번째 인자인 `create()` callback이 있다.
   - Effect에는 `create()` cleanup인 `destroy()`가 있으며, `create()`가 실행될 때만 설정된다.
2. `useEffect()`는 매번 새로운 Effect 객체를 생성하지만, deps array가 변경되면 다른 `tag`를 설정한다.
3. host DOM에 대한 update를 commit할 때 다음 tick의 작업은 `tag`를 기반으로 모든 Effect를 다시 실행하도록 예약된다.
   - 하위 component들의 Effect가 먼저 처리된다.
   - cleanup이 먼저 실행된다.

## 5. Quiz Challenge

위에서 살펴본 내용을 기반으로 useEffect가 어떻게 동작하는지 console.log의 실행순서를 예측해보자.

[https://bigfrontend.dev/react-quiz/useeffect-iii](https://bigfrontend.dev/react-quiz/useeffect-iii)
