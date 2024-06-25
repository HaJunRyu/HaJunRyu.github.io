---
title: "useState의 내부동작"
category: "RCDD"
date: "2024-06-06 13:45:00 +09:00"
desc: "useState의 내부동작"
thumbnail: "./images/rcdd/RCDD-thumbnail.png"
alt: "React Core Deep Dive"
---

> jser.dev 블로그의 [useState](https://jser.dev/2023-06-19-how-does-usestate-work) 챕터를 보며 번역하고 이해한것을 정리하였습니다.

React 개발자라면 `useState()`에 익숙할 것이다. 이번 챕터에서는 아래의 간단한 counter 예제를 통해 Component에서 `useState()`를 활용해 state를 관리할때 내부적으로 어떻게 동작을 하는지 알아보자.

```tsx
import { useState } from "react"

export default function App() {
  const [count, setCount] = useState(0)
  return (
    <div>
      <button onClick={() => setCount(count => count + 1)}>
        click {count}
      </button>
    </div>
  )
}
```

## 1. Initial render(mount) 단계에서의 `useState()`

Initial render에서의 동작은 매우 간단하다.

```tsx
function mountState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  // 새로운 hook을 생성한다
  const hook = mountWorkInProgressHook();

  if (typeof initialState === 'function') {
    initialState = initialState();
  }
  // hook.memoizedState는 실제 state 값을 참조한다.
  hook.memoizedState = hook.baseState = initialState;

// Update queue는 향후 state 업데이트를 보관한다. state가 바로 set되지 않는 점을 명심하자.
// 이유는 update의 우선순위가 다를 수 있기 때문에 즉시 처리 할 필요가 없기 때문이다.
// 우선순위에 대한 자세한 내용은 React의 Lane이 뭔지 찾아보길 추천한다.
// 결론은 update를 보관했다가 나중에 처리한다는 것이다.
  const queue: UpdateQueue<S, BasicStateAction<S>> = {
    pending: null,
    // lanes는 우선순위를 나타낸다.
    lanes: NoLanes,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: (initialState: any),
  };
  // 해당 queue는 hook에 대한 update queue라는 점을 기억해놓자.
  hook.queue = queue;

  const dispatch: Dispatch<
    BasicStateAction<S>,
    // dispatchSetState()는 실제 state를 변경하는 역할을 한다.
    // bind 함수를 통해 currentlyRenderingFiber에 bind되어있는걸 확인할 수 있다.
  > = (queue.dispatch = (dispatchSetState.bind(
    null,
    currentlyRenderingFiber,
    queue,
  ): any));
  // 해당 return 구문은 `useState()`를 사용하며 많이 봐왔던 반환값이다.
  return [hook.memoizedState, dispatch];
}
```

## 2. `setState()` 실행시 어떤 일이 발생하는지

위의 코드를 봤다면 우리는 `setState()`가 실제로는 내부적으로 바인딩된 `dispatchSetState()`라는 것을 알고 있다.

```tsx
function dispatchSetState<S, A>(
  fiber: Fiber,
  queue: UpdateQueue<S, A>,
  action: A,
) {
  // lane은 없데이트의 우선순위를 결정한다
  const lane = requestUpdateLane(fiber);

  const update: Update<S, A> = {
    lane,
    action,
    hasEagerState: false,
    eagerState: null,
    next: (null: any),
  };

  // 렌더링 중에 setState 동작을 할 수 있다.
  if (isRenderPhaseUpdate(fiber)) {
    enqueueRenderPhaseUpdate(queue, update);
  } else {
    const alternate = fiber.alternate;

    // 해당 if문은 bailout을 위한것으로 state가 변하지 않았다면 아무 작업도 수행하지 않는다는것을 뜻한다.
    // bailout은 하위 트리의 리렌더를 건너뛰기 위해 tree를 더 깊이 탐색하지 않는다는 것을 의미한다.
    if (
      fiber.lanes === NoLanes &&
      (alternate === null || alternate.lanes === NoLanes)
    ) {
      // The queue is currently empty, which means we can eagerly compute the
      // next state before entering the render phase. If the new state is the
      // same as the current state, we may be able to bail out entirely.
      const lastRenderedReducer = queue.lastRenderedReducer;
      if (lastRenderedReducer !== null) {
        let prevDispatcher;
        try {
          const currentState: S = (queue.lastRenderedState: any);
          const eagerState = lastRenderedReducer(currentState, action);
          // Stash the eagerly computed state, and the reducer used to compute
          // it, on the update object. If the reducer hasn't changed by the
          // time we enter the render phase, then the eager state can be used
          // without calling the reducer again.
          update.hasEagerState = true;
          update.eagerState = eagerState;
          if (is(eagerState, currentState)) {
            // Fast path. We can bail out without scheduling React to re-render.
            // It's still possible that we'll need to rebase this update later,
            // if the component re-renders for a different reason and by that
            // time the reducer has changed.
            // TODO: Do we still need to entangle transitions in this case?
            enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update);
            // 해당 return 문으로 인해 업데이트가 스케줄링 되지 않는다.
            return;
          }
        } catch (error) {
          // Suppress the error. It will throw again in the render phase.
        } finally {
          if (__DEV__) {
            ReactCurrentDispatcher.current = prevDispatcher;
          }
        }
      }
    }
    // 스케줄링 되지 않은 업데이트는 stash 된다.
    // 그리고 실제 리렌더가 시작될 때 스케줄링 되어 fiber에 추가된다.
    const root = enqueueConcurrentHookUpdate(fiber, queue, update, lane);

    if (root !== null) {
      const eventTime = requestEventTime();

      // 해당 함수는 리렌더를 스케줄링한다. 리렌더는 함수 실행 직후 바로 발생하지는 않는다는 점을 유의하자.
      // 실제 스케줄링은 React 스케줄러에 따라 다르게 된다.
      scheduleUpdateOnFiber(root, fiber, lane, eventTime);

      entangleTransitionUpdate(root, queue, lane);
    }
  }
}
```

업데이트 객체가 어떻게 처리되는지 자세히 살펴보자.

```tsx
// If a render is in progress, and we receive an update from a concurrent event,
// we wait until the current render is over (either finished or interrupted)
// before adding it to the fiber/hook queue. Push to this array so we can
// access the queue, fiber, update, et al later.
const concurrentQueues: Array<any> = [];
let concurrentQueuesIndex = 0;
let concurrentlyUpdatedLanes: Lanes = NoLanes;

// 해당 함수는 prepareFreshStack() 함수 내부에서 호출된다.
// 이는 리렌더의 초기 단계 중 하나다.
// 이는 실제로 리렌더가 시작되기 전에 모든 상태 업데이트가 stash 됨을 의미한다.
export function finishQueueingConcurrentUpdates(): void {
  const endIndex = concurrentQueuesIndex;
  concurrentQueuesIndex = 0;
  concurrentlyUpdatedLanes = NoLanes;
  let i = 0;
  while (i < endIndex) {
    const fiber: Fiber = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const queue: ConcurrentQueue = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const update: ConcurrentUpdate = concurrentQueues[i];
    concurrentQueues[i++] = null;
    const lane: Lane = concurrentQueues[i];
    concurrentQueues[i++] = null;
    if (queue !== null && update !== null) {
      // 앞서 언급한 hook.queue를 기억해보자.
      // 여기에선 stash 된 업데이트가 드디어 fiber에 연결된 것을 볼 수 있다.
      // 이는 업데이트를 처리 할 준비가 됐음을 의미한다.
      const pending = queue.pending;
      if (pending === null) {
        // This is the first update. Create a circular list.
        update.next = update;
      } else {
        update.next = pending.next;
        pending.next = update;
      }
      queue.pending = update;
    }
    if (lane !== NoLane) {
      markUpdateLaneFromFiberToRoot(fiber, update, lane);
    }
  }
}
function enqueueUpdate(
  fiber: Fiber,
  queue: ConcurrentQueue | null,
  update: ConcurrentUpdate | null,
  lane: Lane,
) {
  // Don't update the `childLanes` on the return path yet. If we already in
  // the middle of rendering, wait until after it has completed.
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;

   concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane);
  // The fiber's `lane` field is used in some places to check if any work is
  // scheduled, to perform an eager bailout, so we need to update it immediately.
  // TODO: We should probably move this to the "shared" queue instead.
  fiber.lanes = mergeLanes(fiber.lanes, lane);
  const alternate = fiber.alternate;
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane);
  }
}

export function enqueueConcurrentHookUpdate<S, A>(
  fiber: Fiber,
  queue: HookQueue<S, A>,
  update: HookUpdate<S, A>,
  lane: Lane,
): FiberRoot | null {
  const concurrentQueue: ConcurrentQueue = (queue: any);
  const concurrentUpdate: ConcurrentUpdate = (update: any);
  enqueueUpdate(fiber, concurrentQueue, concurrentUpdate, lane);
  return getRootForUpdatedFiber(fiber);
}
```

```tsx
function markUpdateLaneFromFiberToRoot(
  sourceFiber: Fiber,
  update: ConcurrentUpdate | null,
  lane: Lane,
): void {
  // Update the source fiber's lanes
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane)
  let alternate = sourceFiber.alternate
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane)
  }
  // Walk the parent path to the root and update the child lanes.

  let isHidden = false
  let parent = sourceFiber.return
  let node = sourceFiber
  while (parent !== null) {
    parent.childLanes = mergeLanes(parent.childLanes, lane)
    alternate = parent.alternate
    if (alternate !== null) {
      alternate.childLanes = mergeLanes(alternate.childLanes, lane)
    }
    if (parent.tag === OffscreenComponent) {
      const offscreenInstance: OffscreenInstance = parent.stateNode
      if (offscreenInstance.isHidden) {
        isHidden = true
      }
    }
    node = parent
    parent = parent.return
  }
  if (isHidden && update !== null && node.tag === HostRoot) {
    const root: FiberRoot = node.stateNode
    markHiddenUpdate(root, update, lane)
  }
}
```

```tsx
export function scheduleUpdateOnFiber(
  root: FiberRoot,
  fiber: Fiber,
  lane: Lane,
  eventTime: number,
) {
  checkForNestedUpdates()
  // Mark that the root has a pending update.
  markRootUpdated(root, lane, eventTime)
  if (
    (executionContext & RenderContext) !== NoLanes &&
    root === workInProgressRoot
  ) {
    // Track lanes that were updated during the render phase
    workInProgressRootRenderPhaseUpdatedLanes = mergeLanes(
      workInProgressRootRenderPhaseUpdatedLanes,
      lane,
    )
  } else {
    if (root === workInProgressRoot) {
      // Received an update to a tree that's in the middle of rendering. Mark
      // that there was an interleaved update work on this root. Unless the
      // `deferRenderPhaseUpdateToNextBatch` flag is off and this is a render
      // phase update. In that case, we don't treat render phase updates as if
      // they were interleaved, for backwards compat reasons.
      if (
        deferRenderPhaseUpdateToNextBatch ||
        (executionContext & RenderContext) === NoContext
      ) {
        workInProgressRootInterleavedUpdatedLanes = mergeLanes(
          workInProgressRootInterleavedUpdatedLanes,
          lane,
        )
      }
      if (workInProgressRootExitStatus === RootSuspendedWithDelay) {
        // The root already suspended with a delay, which means this render
        // definitely won't finish. Since we have a new update, let's mark it as
        // suspended now, right before marking the incoming update. This has the
        // effect of interrupting the current render and switching to the update.
        // TODO: Make sure this doesn't override pings that happen while we've
        // already started rendering.
        markRootSuspended(root, workInProgressRootRenderLanes)
      }
    }
    ensureRootIsScheduled(root, eventTime)

    if (
      lane === SyncLane &&
      executionContext === NoContext &&
      (fiber.mode & ConcurrentMode) === NoMode &&
      // Treat `act` as if it's inside `batchedUpdates`, even in legacy mode.
      !(__DEV__ && ReactCurrentActQueue.isBatchingLegacy)
    ) {
      // Flush the synchronous work now, unless we're already working or inside
      // a batch. This is intentionally inside scheduleUpdateOnFiber instead of
      // scheduleCallbackForFiber to preserve the ability to schedule a callback
      // without immediately flushing it. We only do this for user-initiated
      // updates, to preserve historical behavior of legacy mode.
      resetRenderTimer()
      flushSyncCallbacksOnlyInLegacyMode()
    }
  }
}
```

## 3. 리렌더링 시의 `useState()`

업데이트가 stash 되면 이제 실제로 업데이트를 실행하고 상태 값을 업데이트 할 차례이다.
이는 실제로 리렌더링할 때 `useState()`에서 발생한다.

```tsx
function updateState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  return updateReducer(basicStateReducer, (initialState: any));
}
function updateReducer<S, I, A>(
  reducer: (S, A) => S,
  initialArg: I,
  init?: I => S,
): [S, Dispatch<A>] {
  const hook = updateWorkInProgressHook();

  const queue = hook.queue;

  if (queue === null) {
    throw new Error(
      'Should have a queue. This is likely a bug in React. Please file an issue.',
    );
  }
  queue.lastRenderedReducer = reducer;
  const current: Hook = (currentHook: any);
  // The last rebase update that is NOT part of the base state.
  let baseQueue = current.baseQueue;
baseQueue needs some explanation.

  // The last pending update that hasn't been processed yet.
  const pendingQueue = queue.pending;
  if (pendingQueue !== null) {
    // We have new updates that haven't been processed yet.
    // We'll add them to the base queue.
    if (baseQueue !== null) {
      // Merge the pending queue and the base queue.
      const baseFirst = baseQueue.next;
      const pendingFirst = pendingQueue.next;
      baseQueue.next = pendingFirst;
      pendingQueue.next = baseFirst;
    }
    current.baseQueue = baseQueue = pendingQueue;
    queue.pending = null;

  }
  if (baseQueue !== null) {
    // We have a queue to process.
    const first = baseQueue.next;
    let newState = current.baseState;
    let newBaseState = null;
    let newBaseQueueFirst = null;
    let newBaseQueueLast = null;

    let update = first;
    do {
      ...
      // Check if this update was made while the tree was hidden. If so, then
      // it's not a "base" update and we should disregard the extra base lanes
      // that were added to renderLanes when we entered the Offscreen tree.
      const shouldSkipUpdate = isHiddenUpdate
        ? !isSubsetOfLanes(getWorkInProgressRootRenderLanes(), updateLane)
        : !isSubsetOfLanes(renderLanes, updateLane);
      if (shouldSkipUpdate) {
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<S, A> = {
          lane: updateLane,
          action: update.action,
          hasEagerState: update.hasEagerState,
          eagerState: update.eagerState,
          next: (null: any),
        };
        if (newBaseQueueLast === null) {
          newBaseQueueFirst = newBaseQueueLast = clone;
          newBaseState = newState;
        } else {
          newBaseQueueLast = newBaseQueueLast.next = clone;
        }
        // Update the remaining priority in the queue.
        // TODO: Don't need to accumulate this. Instead, we can remove
        // renderLanes from the original lanes.
        currentlyRenderingFiber.lanes = mergeLanes(
          currentlyRenderingFiber.lanes,
          updateLane,
        );
        markSkippedUpdateLanes(updateLane);
      } else {
        // This update does have sufficient priority.
        if (newBaseQueueLast !== null) {

          const clone: Update<S, A> = {
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane,
            action: update.action,
            hasEagerState: update.hasEagerState,
            eagerState: update.eagerState,
            next: (null: any),
          };
          newBaseQueueLast = newBaseQueueLast.next = clone;
        }

        // Process this update.
        if (update.hasEagerState) {
          // If this update is a state update (not a reducer) and was processed eagerly,
          // we can use the eagerly computed state
          newState = ((update.eagerState: any): S);
        } else {
          const action = update.action;
          newState = reducer(newState, action);
        }
      }
      update = update.next;
    } while (update !== null && update !== first);
    if (newBaseQueueLast === null) {
      newBaseState = newState;
    } else {
      newBaseQueueLast.next = (newBaseQueueFirst: any);
    }
    // Mark that the fiber performed work, but only if the new state is
    // different from the current state.
    if (!is(newState, hook.memoizedState)) {
      markWorkInProgressReceivedUpdate();

    }
    hook.memoizedState = newState;

    hook.baseState = newBaseState;
    hook.baseQueue = newBaseQueueLast;

    queue.lastRenderedState = newState;
  }
  if (baseQueue === null) {
    // `queue.lanes` is used for entangling transitions. We can set it back to
    // zero once the queue is empty.
    queue.lanes = NoLanes;
  }
  const dispatch: Dispatch<A> = (queue.dispatch: any);
  return [hook.memoizedState, dispatch];
}
```

## 4. Summary

이번 Summary는 해당 글의 원문인 Jser 블로그 글에 있는 [슬라이드](https://jser.dev/2023-06-19-how-does-usestate-work#4-summary)를 살펴보며 위 내용들을 복기해보자.

## 5. 주의사항 살펴보고 이해하기

React.dev에서는 useState의 주의사항에 대해 리스트업 되어있다. 주의 사항이 존재하는 이유를 이해해보자.

### 5.1 state update is not sync

> `set` 함수는 다음 렌더링에 대한 상태 변수만 업데이트 한다. `set` 함수를 호출한 후 상태 변수를 참조하면 [호출하기 전에 있었던 이전 값을 계속 얻을 것](https://react.dev/reference/react/useState#ive-updated-the-state-but-logging-gives-me-the-old-value)이다.

위 글에 대해 이해해보자. 우리는 `setState()`가 다음 tick에서 어떻게 다시 리렌더링을 스케줄링 하는지 이미 살펴봤다. 이는 동기화 되지 않으며 업데이트된 값은 상태 업데이트가 `useState()`에서 수행되기 때문에 다음 렌더링 때만 얻을 수 있다.

### 5.2 동일한 값을 가진 `setState()`는 여전히 다시 렌더링을 트리거 할 수 있다.

> 새로운 값이 Object.is에 의해 비교됐을때 현재 state와 동일하다면 React는 Component와 하위 Component의 리렌더링을 건너뛴다. 이것은 최적화를 위함이고 경우에 따라 React는 하위 Component를 건너뛰기 전에 Component를 호출해야 할 수도 있지만 코드에 영향을 주어선 안된다.

위 주의사항이 가장 까다롭다고 생각이 된다. 한번 [해당 퀴즈](https://bigfrontend.dev/react-quiz/useState)를 풀어보자.

문제를 풀어보면서 동일한 state value를 설정했는데 왜 리렌더링이 발생하는지 이해를 해야한다.

```tsx
// 해당 조건에서는 상태가 변경되지 않으면 리렌더링 스케줄링 하지 않는다.
if (
  fiber.lanes === NoLanes &&
  (alternate === null || alternate.lanes === NoLanes)
) {
```

이전 슬라이드에서 설명했듯이 가장 좋은 확인 방법은 pending update queue와 hook의 baseQueue가 비어 있는지 확인하는 것이다. 그러나 현재 구현에 따르면 실제로 리렌더링을 시작할 때까지 그 결과가 true인지 알 수 없다.

따라서 여기서는 Fiber Node에 업데이트가 없는지 확인하는 곳으로 돌아가야한다. 업데이트가 대기열에 추가되면 Fiber가 dirty로 표시되는 것을 확인했으므로 리렌더링이 시작될 때까지 기다릴 필요가 없다.

그러나 사이드 이펙트가 있다.

```tsx
function enqueueUpdate(
  fiber: Fiber,
  queue: ConcurrentQueue | null,
  update: ConcurrentUpdate | null,
  lane: Lane,
) {
  concurrentQueues[concurrentQueuesIndex++] = fiber
  concurrentQueues[concurrentQueuesIndex++] = queue
  concurrentQueues[concurrentQueuesIndex++] = update
  concurrentQueues[concurrentQueuesIndex++] = lane
  concurrentlyUpdatedLanes = mergeLanes(concurrentlyUpdatedLanes, lane)
  fiber.lanes = mergeLanes(fiber.lanes, lane)
  const alternate = fiber.alternate
  if (alternate !== null) {
    alternate.lanes = mergeLanes(alternate.lanes, lane)
  }
}
```

업데이트를 대기열에 넣을 때 current 및 alternate fiber 모두 dirty lane으로 표시되는 것을 볼 수 있다. 이는 `dispatchSetState()`가 source fiber에 바인딩되어 있으므로 current 및 alternate를 모두 업데이트하지 않으면 업데이트가 처리되는지 확인할 수 없기 때문에 필요하다.

하지만 lane을 지우는것은 실제 리렌더링인 `BeginWork()`에서만 발생한다.

```tsx
function beginWork(
  current: Fiber | null,
  workInProgress: Fiber,
  renderLanes: Lanes,
): Fiber | null {
  ...
  // Before entering the begin phase, clear pending update priority.
  // TODO: This assumes that we're about to evaluate the component and process
  // the update queue. However, there's an exception: SimpleMemoComponent
  // sometimes bails out later in the begin phase. This indicates that we should
  // move this assignment out of the common path and into each branch.
  workInProgress.lanes = NoLanes;
  ...
}
```

이로 인해 업데이트가 예약되면 dirty lane flag의 전체 삭제는 최소 2번의 리렌더링 이후에만 수행된다.

1. fiber1 (current, clean) / null (alternate) → fiber1은 `useState()`의 source fiber다.
2. setState(true) → true와 false는 다르기 때문에, early bailout이 일어나지 않는다.
3. fiber1 (current, dirty) / null (alternate) → queue에 업데이트를 추가한다.
4. fiber1 (current, dirty) / fiber2 (workInProgress, dirty) → 리렌더링이 시작되며, 새로운 fiber를 workInProgress로 생성한다.
5. fiber1 (current, dirty) / fiber2 (workInProgress, clean) → `beginWork()`에서 lanes가 없어진다.
6. fiber1 (alternate, dirty) / fiber2 (current, clean) → commit 이후에 React는 두 버전의 fiber tree를 swap한다.
7. `setState(true)` → 둘 중 하나의 fiber는 clean하지 않으므로, early bailout은 여전히 일어나지 않는다.
8. fiber1 (alternate, dirty) / fiber2 (current, dirty) → queue에 업데이트를 추가한다.
9. fiber1 (workInProgress, dirty) / fiber2 (current, dirty) → 리렌더링이 시작되며, fiber1은 fiber2로부터 lanes를 할당받는다.
10. fiber1 (workInProgress, clean) / fiber2 (current, dirty) → `beginWork()`에서 lanes가 없어진다.
11. fiber1 (workInProgress, clean) / fiber2 (current, clean) → state가 변경되지 않았으므로, `bailoutHooks()`에서 current fiber의 lanes가 삭제되고 bailout(NOT early bailout)이 발생한다.
12. fiber1 (current, clean) / fiber2 (alternate, clean) → commit 이후에 React는 두 버전의 fiber tree를 swap한다.
13. setState(true) → 이제 두 fibers 모두 clean하므로, early bailout을 할 수 있다!

이 문제는 해결될 수 있을 것 같기도 하다. 하지만 fiber architecture와 hook의 작동 방식 때문에 비용이 너무 많이 들 수도 있다. 대부분의 경우 문제가 없기 때문에 React 팀에서 이를 고칠 의도가 없다고 보는 [논의가 이미 존재](https://github.com/facebook/react/issues/14994)한다.

React는 필요하다고 생각되면 리렌더링한다는 점을 명심해야 하며, 퍼포먼스를 위한 트릭이 항상 작동한다고 가정해서는 안 된다.

### 5.3 React batches state updates

> React는 상태 업데이트를 일괄 처리한다. 모든 이벤트 핸들러가 실행되고 설정된 기능을 호출한 후에 화면을 업데이트한다. 이렇게 하면 단일 이벤트 중에 여러 번 리렌더링되는 것을 방지할 수 있다. 예를 들어 DOM에 액세스하기 위해 React가 화면을 더 일찍 업데이트하도록 강제해야 하는 드문 경우에는 flashSync를 사용할 수 있다.

이전 슬라이드에서 설명된 것처럼 업데이트는 실제로 처리되기 전에 stash 됐다가 한번에 처리된다.
