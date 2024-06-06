---
title: "useEffect의 내부동작"
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
