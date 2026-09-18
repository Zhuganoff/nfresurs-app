/* Диагностика верхней области. Подключается только по явному включению
   (#diag в адресе или ?diag=1) и на обычном открытии сайта не загружается.

   Задача — снять фактические значения на устройстве владельца: какая
   сборка реально открыта, что вернул env(safe-area-inset-*), где стоит
   шапка, какой высоты полоса над ней, какой фон у html и body. Пробные
   узлы создаются один раз, обновление собирается через requestAnimationFrame:
   панель не должна сама добавлять рывков при прокрутке. */
(function () {
  if (window.__диагностикаВключена) return;
  window.__диагностикаВключена = true;

  var панель = document.createElement('div');
  панель.setAttribute('aria-hidden', 'true');
  панель.style.cssText =
    'position:fixed;left:6px;right:6px;bottom:6px;z-index:2147483647;' +
    'background:#0B2C37;color:#EAF3F7;border:1px solid #2B6472;border-radius:10px;' +
    'padding:8px 10px;font:11px/1.45 -apple-system,system-ui,sans-serif;' +
    'white-space:pre-wrap;pointer-events:none;max-height:52vh;overflow:hidden;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.45)';

  var текст = document.createElement('div');
  var кнопка = document.createElement('button');
  кнопка.type = 'button';
  кнопка.textContent = 'Скопировать измерения';
  кнопка.style.cssText =
    'margin-top:6px;pointer-events:auto;background:#12485A;color:#EAF3F7;' +
    'border:1px solid #2B6472;border-radius:8px;padding:6px 10px;font:inherit';
  панель.appendChild(текст);
  панель.appendChild(кнопка);

  /* постоянные пробы: по одной на сторону, пересоздавать их на каждое
     событие прокрутки нельзя — это само по себе дёргает страницу */
  var пробы = {};
  ['top', 'right', 'bottom', 'left'].forEach(function (сторона) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;top:0;left:0;width:env(safe-area-inset-' + сторона +
      ');height:env(safe-area-inset-' + сторона + ');visibility:hidden;pointer-events:none';
    пробы[сторона] = d;
  });

  function готово() {
    document.body.appendChild(панель);
    Object.keys(пробы).forEach(function (k) { document.body.appendChild(пробы[k]); });
    кнопка.addEventListener('click', function () {
      var t = текст.textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(function () {
          кнопка.textContent = 'Скопировано';
          setTimeout(function () { кнопка.textContent = 'Скопировать измерения'; }, 1500);
        }, function () { кнопка.textContent = 'Скопировать не вышло'; });
      } else {
        кнопка.textContent = 'Буфер недоступен';
      }
    });
    /* первый снимок рисуем сразу: requestAnimationFrame может не сработать,
       если вкладка открыта в фоне или кадры придушены — панель обязана
       показать значения в любом случае */
    текст.textContent = собрать();
  }

  function врезка(сторона) {
    var r = пробы[сторона].getBoundingClientRect();
    return Math.round((сторона === 'top' || сторона === 'bottom' ? r.height : r.width) * 10) / 10;
  }

  function прямоугольник(el) {
    if (!el) return 'нет';
    var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return cs.position + ' y=' + Math.round(r.top) + ' h=' + Math.round(r.height) +
      ' pad=' + cs.paddingTop + ' z=' + cs.zIndex;
  }

  function собрать() {
    var шапка = document.querySelector('.top') || document.querySelector('header.app');
    var полоса = document.querySelector('.top-cap');
    var vv = window.visualViewport;
    var мета = document.querySelector('meta[name=viewport]');
    var сборка = document.querySelector('meta[name=build]');
    var отметка = document.querySelector('.build-mark');
    var csШ = шапка ? getComputedStyle(шапка) : null;
    return [
      'сборка: ' + (сборка ? сборка.content : (отметка ? отметка.textContent : 'не указана')),
      'viewport: ' + (мета ? мета.content : 'нет'),
      'safe-area в/п/н/л: ' + врезка('top') + ' / ' + врезка('right') + ' / ' +
        врезка('bottom') + ' / ' + врезка('left'),
      'шапка: ' + прямоугольник(шапка),
      'фон шапки: ' + (csШ ? csШ.backgroundColor : '—') +
        ' размытие: ' + (csШ ? (csШ.webkitBackdropFilter || csШ.backdropFilter) : '—'),
      'полоса сверху: ' + прямоугольник(полоса),
      'фон html: ' + getComputedStyle(document.documentElement).backgroundColor,
      'фон body: ' + getComputedStyle(document.body).backgroundColor,
      'прокрутка: ' + Math.round(window.scrollY),
      'layout: ' + innerWidth + '×' + innerHeight +
        '  экран: ' + screen.width + '×' + screen.height + '  dpr ' + devicePixelRatio,
      'visual: ' + (vv ? Math.round(vv.width) + '×' + Math.round(vv.height) +
        ' масштаб ' + (Math.round(vv.scale * 100) / 100) + ' сдвиг ' + Math.round(vv.offsetTop) : 'нет'),
      'режим: ' + (matchMedia('(display-mode: standalone)').matches || navigator.standalone
        ? 'с домашнего экрана' : (window.Telegram && window.Telegram.WebApp &&
          window.Telegram.WebApp.initData ? 'Telegram' : 'браузер')),
      'браузер: ' + navigator.userAgent.replace(/^Mozilla\/5\.0 \(/, '').slice(0, 54),
      телеграм()
    ].filter(Boolean).join('\n');
  }

  /* Telegram отдаёт свои безопасные области отдельно от CSS. Здесь мы их
     только показываем: нужно увидеть, отличаются ли они от env(...), и не
     складывать два источника отступов вслепую. */
  function телеграм() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg) return '';
    function пара(o) {
      return o ? [o.top, o.right, o.bottom, o.left].join('/') : 'нет';
    }
    return 'Telegram: safeArea ' + пара(tg.safeAreaInset) +
      '  content ' + пара(tg.contentSafeAreaInset) +
      '  высота ' + (tg.viewportHeight || '—') + '/' + (tg.viewportStableHeight || '—') +
      '  версия ' + (tg.version || '—');
  }

  var ждёмКадр = false;
  function запланировать() {
    if (ждёмКадр) return;
    ждёмКадр = true;
    requestAnimationFrame(function () {
      ждёмКадр = false;
      текст.textContent = собрать();
    });
  }

  ['scroll', 'resize', 'orientationchange'].forEach(function (со) {
    addEventListener(со, запланировать, { passive: true });
  });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', запланировать);
    visualViewport.addEventListener('scroll', запланировать);
  }

  if (document.body) готово();
  else addEventListener('DOMContentLoaded', готово);
})();
