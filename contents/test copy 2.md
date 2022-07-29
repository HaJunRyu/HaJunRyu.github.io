---
date: '2022-02-24'
title: '인용문(q, blockquote)'
categories: ['Web', 'HTML']
summary: 'HTML5에서 인용문을 사용하는 방법에 대해 알아보자'
thumbnail: './test.png'
---

# 인용문(q, blockquote)

![](https://user-images.githubusercontent.com/71176945/145383954-112fe458-7274-4ac5-8c28-49def4ce9e5c.png)

## 사용법 및 정의

- [인용문](https://namu.wiki/w/%EC%9D%B8%EC%9A%A9)임을 나타내는 태그이다.

- `<q>`태그는 문단 안에서 인용할 때 사용하는 inline 요소이다.

- `<blockquote>`태그는 새로운 문단에서 인용하는 block 요소이다.

- 보통 3줄 이내로 짧게 인용할 경우 q태그를 사용하고 3줄 이상의 문단 전체를 인용할때 blockquote를 사용한다.

- cite속성을 이용하여 인용문의 출처를 나타내줄 수 있지만 필수 속성은 아니다.

```html
<q cite="www..."></q>
<blockquote cite="www..."></blockquote>
```

## q태그`<q></q>`

- q태그의 기본 css속성

```css
q {
  display: inline;
}
q::before {
  content: open-quote;
}
q::after {
  content: close-quote;
}
```

- q태그는 특이하게도 기본속성으로 가상요소 선택자인 before요소로는 인용문을 여는 쌍 따옴표 (") after요소로는 닫는 쌍 따옴표 (")가 생성된다.

- 만약 가상요소선택자를 초기화 시켜주고 싶을 경우 content속성의 값을 null("")로 지정해주면 된다.

- 변경도 가능하다. 만약 인용문을 [](대괄호)로 감싸주고 싶다면 `content: "[""]"` 이와 같이 선언해주면 된다.

### q태그를 사용한 인용문의 예시

```html
<p>
  팀 버너스 리 경은 말했다.
  <q cite=""
    >웹의 힘은 그것의 보편성에 있다.장애에 구애없이 모든 사람이 접근할 수 있는 것이 필수적인
    요소이다.</q
  >
  - 팀 버너스 리경 - 웹의 창시자 제대로 된 프론트엔드 개발자가 되기 위해 웹에서 접근성을
  고려하는것은 꼭 갖춰야 할 덕목이라고 생각한다.
</p>
```

## blockquote태그 `<blockquote></blockquote>`

- blockquote태그의 기본 css속성

```css
blockquote {
  display: block;
  margin-top: 1em;
  margin-bottom: 1em;
  margin-left: 40px;
  margin-right: 40px;
}
```

### blockquote태그를 사용한 인용문의 예시

```html
<div>
  <h1>백범 김구 선생님</h1>
  <blockquote cite="https://namu.wiki/w/%EA%B9%80%EA%B5%AC#s-1">
    <p>
      한국의 독립운동가, 정치인. 일제강점기 시절 독립운동가 중에서도 순위권에 손꼽히는 인지도와
      영향력을 가진 정치인으로 평가받는다. 동학농민운동과 교육계몽운동에 참여했고, 1919년에는 중국
      상하이로 건너가 대한민국 임시정부 수립에 참여하여 의정원 의원, 내무총장, 국무총리 대리,
      내무총장 겸 노동국 총판, 국무령, 의정원 의원, 국무위원 겸 내무장, 재무장, 군무장을 거쳐 1940년
      임시정부 주석에 선출됐다.
    </p>
    <cite>나무위키</cite>
    <!-- cite속성과 다른 cite태그 - URL이 아닌 출처를 표기해줄때 사용한다. -->
  </blockquote>
</div>
```
