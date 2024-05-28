---
title: "React Scheduler의 내부동작"
category: "RCDD"
date: "2024-05-19 23:08:00 +09:00"
desc: "React Scheduler의 내부동작에 대해 알아보자"
thumbnail: "./images/rcdd/RCDD-thumbnail.png"
alt: "React Core Deep Dive"
---

> jser.dev 블로그의 [Scheduler](https://jser.dev/react/2022/03/16/how-react-scheduler-works) 챕터를 보며 번역하고 이해한것을 정리하였습니다.

## 1. React Scheduler는 왜 필요할까

[챕터1 Overview](https://jser.dev/2023-07-11-overall-of-react-internals)에서 살펴봤던 `workLoopSync()` 함수를 살펴보며 Scheduler에 대해 알아보기 시작하자.

```tsx
function workLoopSync() {
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress)
  }
}
```

간략히 정리해보자면 React는 Fiber Tree의 각 Fiber에 대해 내부적으로 작동하고, `WorkInProgress`는 현재 위치를 추적하는 것이며, 순회 알고리즘은 이미 이전 게시물에서 설명했다.

`workLoopSync()`는 동기식이므로 작업이 중단되지 않으므로 이해하기 매우 쉽다. 따라서 React는 while loop에서 계속 작업한다.

단, concurrent mode에서는 상황이 다르다.

```tsx
function workLoopConcurrent() {
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress)
  }
}
```

concurrent mode에서는 우선 순위가 높은 작업이 우선 순위가 낮은 작업을 중단할 수 있다. 작업을 중단하고 다시 시작하는 방법이 필요하고 이것이 `shouldYield()`가 하는 일이지만 분명 그 이상이 있다.

## 2. 먼저 몇 가지 배경 지식부터 살펴보자.

### 2.1 Event Loop

Event Loop에 대해서는 사실 [javascript.info의 Event loop](https://javascript.info/event-loop)설명을 읽거나 [Jake Archibald의 영상](https://x.com/jaffathecake/status/961980260194684928)을 시청하는것을 더 추천한다.

그래도 간단히 글로 정리해보자.

1. task 대기열에서 작업(macro task)을 가져와 실행한다.
2. 스케줄링 된 micro tasks가 있다면 실행한다.
3. 렌더링이 필요한지 확인하고 수행한다.
4. task가 더 있으면 단계 1을 반복하거나 추가 작업을 기다린다.

`loop`는 실제로 일종의 loop가 있기 때문에 설명을 할 필요가 있다.

### 2.2 렌더링을 차단하지 않고 새 작업을 예약하려면 `setImmediate()`를 호출한다.

렌더링을 차단하지 않고 일부 task를 스케줄링 하기 위해(위의 3단계), 우리는 이미 `setTimeout(callback, 0)`의 트릭에 익숙하며 새 macro task를 예약한다.

더 나은 API인 `setImmediate()`가 있지만 IE 및 node.js에서만 사용할 수 있다.

이제 React Scheduler의 첫 번째 코드를 다룰 준비가 되었다. [원본 소스코드](https://github.com/facebook/react/blob/e62a8d754548a490c2a3bcff3b420e5eedaf11c0/packages/scheduler/src/forks/Scheduler.js#L550)

```tsx
let schedulePerformWorkUntilDeadline
if (typeof localSetImmediate === "function") {
  // Node.js and old IE.
  // There's a few reasons for why we prefer setImmediate.
  //
  // Unlike MessageChannel, it doesn't prevent a Node.js process from exiting.
  // (Even though this is a DOM fork of the Scheduler, you could get here
  // with a mix of Node.js 15+, which has a MessageChannel, and jsdom.)
  // https://github.com/facebook/react/issues/20756
  //
  // But also, it runs earlier which is the semantic we want.
  // If other browsers ever implement it, it's better to use it.
  // Although both of these would be inferior to native scheduling.
  schedulePerformWorkUntilDeadline = () => {
    localSetImmediate(performWorkUntilDeadline)
  }
} else if (typeof MessageChannel !== "undefined") {
  // DOM and Worker environments.
  // We prefer MessageChannel because of the 4ms setTimeout clamping.
  const channel = new MessageChannel()
  const port = channel.port2
  channel.port1.onmessage = performWorkUntilDeadline
  schedulePerformWorkUntilDeadline = () => {
    port.postMessage(null)
  }
} else {
  // We should only fallback here in non-browser environments.
  schedulePerformWorkUntilDeadline = () => {
    localSetTimeout(performWorkUntilDeadline, 0)
  }
}
```

여기서는 MessageChannel 및 setTimeout을 사용하여 `setImmediate()`의 2가지 대체 방법을 볼 수 있다.

### 2.3 Priority Queue

Priority Queue는 스케줄링을 위한 일반적인 데이터 구조이다. [해당 링크](https://bigfrontend.dev/problem/create-a-priority-queue-in-JavaScript)로 접근하여 JavaScript로 우선 순위 대기열을 직접 만들어 볼 수도 있다.

이는 React의 요구사항에 완벽하게 맞는다. 우선순위가 다른 이벤트가 들어오기 때문에 처리할 우선순위가 가장 높은 이벤트를 빠르게 찾아야 한다.

React는 최소 heap으로 Priority Queue를 구현한다. 관련 소스코드의 [원본 링크](https://github.com/facebook/react/blob/e62a8d754548a490c2a3bcff3b420e5eedaf11c0/packages/scheduler/src/SchedulerMinHeap.js)이다.

## 3. workLoopConcurrent의 Call stack

이제 workLoopConcurrent가 어떻게 호출되는지 살펴보자.

![](./images/rcdd/scheduler/scheduler-1.png)

전체 코드는 [ReactFiberWorkLoop.js](https://github.com/facebook/react/blob/e62a8d754548a490c2a3bcff3b420e5eedaf11c0/packages/react-reconciler/src/ReactFiberWorkLoop.old.js)에 있습니다. 코드를 분석해보자.

우리는 `ensureRootIsScheduled()`를 여러 번 본적이 있고 꽤 많은 곳에서 사용되었다. 이름에서 알 수 있듯이, `ensureRootIsScheduled()`는 업데이트가 있는 경우 React가 업데이트를 수행하도록 작업을 예약한다.

`PerformConcurrentWorkOnRoot`를 직접 호출하지 않고, `ScheduleCallback(priority, callback)`에 의 한 콜백으로 처리한다는 점에 유의하자. `ScheduleCallback()`은 Scheduler의 API이다.

일단 지금은 스케줄러가 적절한 시간에 작업을 실행한다는 점만을 알고 넘어가자.

### 3.1 `PerformConcurrentWorkOnRoot()`는 중단되면 자체적으로 클로저를 반환한다.

`PerformConcurrentWorkOnRoot()`가 진행 상황에 따라 다르게 반환되는 것을 확인해보자.

1. `shouldYield()`가 true인 경우 workLoopConcurrent가 중단되어 불완전한 `update(RootInComplete)`가 발생하고, `PerformConcurrentWorkOnRoot()`는 `PerformConcurrentWorkOnRoot.bind(null, root)`를 반환한다. ([code](https://github.com/facebook/react/blob/555ece0cd14779abd5a1fc50f71625f9ada42bef/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1167))
2. 완료되면 null을 반환한다.

`shouldYield()`에 의해 작업이 중단되면 어떻게 재개되는지 궁금할 것이다. 스케줄러는 작업 콜백의 반환 값을 살펴보고 계속되는지 확인한다. 반환 값은 일종의 일정 조정이다. 이에 대해서는 곧 다루겠다.

## 4. Scheduler

마지막으로 Scheduler 영역을 살펴보자. 너무 부담스러워하지 않아도 된다. 처음에는 겁이 나지만 곧 불필요하다는 걸 깨달을 수 있다.

Message Queue는 제어권을 전달하는 방법이며 Scheduler도 이와 똑같다.

위에서 언급한 `ScheduleCallback()`은 Scheduler 세계의 [unstable_scheduleCallback](https://github.com/facebook/react/blob/e62a8d754548a490c2a3bcff3b420e5eedaf11c0/packages/scheduler/src/forks/Scheduler.js#L308)입니다.

### 4.1 `scheduleCallback()` - Scheduler schedules tasks by exipriationTime

Scheduler가 작업을 예약하려면 먼저 작업을 우선 순위와 함께 저장해야 한다. 이는 우리가 이미 배경 지식으로 다룬 우선 순위 대기열에 의해 수행된다.

`expirationTime`을 사용하여 우선 순위를 나타낸다. 이것은 공평하다. 만료가 빠르면 더 빨리 처리해야 한다. 다음은 작업이 생성되는 `ScheduleCallback()` 내부 코드이다.

```tsx
var currentTime = getCurrentTime()
var startTime
if (typeof options === "object" && options !== null) {
  var delay = options.delay
  if (typeof delay === "number" && delay > 0) {
    startTime = currentTime + delay
  } else {
    startTime = currentTime
  }
} else {
  startTime = currentTime
}
var timeout
switch (priorityLevel) {
  case ImmediatePriority:
    timeout = IMMEDIATE_PRIORITY_TIMEOUT
    break
  case UserBlockingPriority:
    timeout = USER_BLOCKING_PRIORITY_TIMEOUT
    break
  case IdlePriority:
    timeout = IDLE_PRIORITY_TIMEOUT
    break
  case LowPriority:
    timeout = LOW_PRIORITY_TIMEOUT
    break
  case NormalPriority:
  default:
    timeout = NORMAL_PRIORITY_TIMEOUT
    break
}
var expirationTime = startTime + timeout

// task는 스케줄러가 처리하는 작업 단위이다.
var newTask = {
  id: taskIdCounter++,
  callback,
  priorityLevel,
  startTime,
  expirationTime,
  sortIndex: -1,
}
```

코드는 매우 간단하다. 우선순위마다 시간 제한이 다른것을 아래 코드를 보면 알 수 있다.

```tsx
// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250

// 기본 timeout값은 5초이다.
var NORMAL_PRIORITY_TIMEOUT = 5000

var LOW_PRIORITY_TIMEOUT = 10000
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt
```

기본적으로 시간 제한은 5초이고 user blocking의 경우 250ms이다. 우리는 곧 이러한 우선순위의 몇 가지 예를 보게 될 것이다.

Task가 생성되었으니 이제 Priority Queue에 넣을 차례입니다.

```tsx
if (startTime > currentTime) {
  // This is a delayed task.
  newTask.sortIndex = startTime
  push(timerQueue, newTask)
  if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
    // All tasks are delayed, and this is the task with the earliest delay.
    if (isHostTimeoutScheduled) {
      // Cancel an existing timeout.
      cancelHostTimeout()
    } else {
      isHostTimeoutScheduled = true
    }
    // Schedule a timeout.
    requestHostTimeout(handleTimeout, startTime - currentTime)
  }
} else {
  newTask.sortIndex = expirationTime
  push(taskQueue, newTask)
  // Schedule a host callback, if needed. If we're already performing work,
  // wait until the next time we yield.
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true
    requestHostCallback(flushWork)
  }
}
```

작업을 예약할 때 `setTimeout()`과 같은 지연 옵션이 있을 수 있다. 이 부분에 대해선 따로 살펴보도록 하자.

여기선 else 지점에만 집중하자. 우리는 두 가지 중요한 호출을 볼 수 있다.

1. `push(taskQueue, newTask)` - 작업을 대기열에 추가한다. 이것은 단지 우선순위 대기열 API이므로 건너뛰겠다.
2. `requestHostCallback(flushWork)` - 이곳에서 요청

`requestHostCallback(flushWork)`은 필요하다. Scheduler는 호스트에 구애받지 않기 때문에 모든 호스트에서 실행될 수 있는 독립적인 블랙 박스여야 하므로 요청해야 한다.
