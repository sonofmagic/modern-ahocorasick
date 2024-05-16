export function vis() {
  'use strict'

  let sstorage
  try {
    sstorage = sessionStorage
  }
  catch (e) {
    // if serving directly from a file
    let sdata = {}
    sstorage = {
      getItem(k) {
        return sdata[k]
      },
      setItem(k, v) {
        sdata[k] = v
      },
      clear() {
        sdata = {}
      },
    }
  }
  let aho
  const text = document.querySelector('textarea')
  const keywords = document.querySelector('#keywords')
  const pre = document.querySelector('#text-pre')
  const btn = document.querySelector('button')
  const currentS = document.querySelector('#current-state')
  const found = document.querySelector('#found')
  const range = document.querySelector('input[type="range"]')
  const failure = document.querySelector('#failure-function')
  const output = document.querySelector('#output-function')
  let prev = null
  let allFound = []

  const fillPre = function (v) {
    pre.innerHTML = v.replace(/(.)/g, '<span>$1</span>')
  }

  const restart = function () {
    if (prev) {
      prev.style('fill', '')
    }
    prev = null
    allFound = []
    text.value = (sstorage.getItem('text') || text.value || 'ushers').trim()
    keywords.value = (sstorage.getItem('keywords') || 'he,she,his,hers').trim()
    currentS.innerHTML = ''
    found.innerHTML = ''

    fillPre(text.value)
    aho = new AhoCorasick(keywords.value.split(','))
    draw(aho)
  }

  fillPre(text.value)
  let _kptimer = null
  text.addEventListener('keydown', () => {
    window.clearTimeout(_kptimer)
    _kptimer = setTimeout(() => {
      sstorage.setItem('text', text.value)
      fillPre(text.value)
    }, 250)
  })

  let _wordstimer = null
  keywords.addEventListener('keydown', () => {
    window.clearTimeout(_wordstimer)
    _wordstimer = setTimeout(() => {
      const v = keywords.value.trim()
      sstorage.setItem('keywords', v)
      restart()
    }, 250)
  })

  const drv = sstorage.getItem('range')
  if (drv) {
    range.value = drv
  }
  range.addEventListener('change', () => {
    sstorage.setItem('range', range.value)
  })

  const _fillNode = function (el, data) {
    prev = el
    el.style('fill', 'green')

    const l = pre.querySelector(`:nth-child(${data.index + 1})`)
    if (!data.result) {
      l.className = 'fail'
    }
    else {
      l.className = 'match'
      if (data.found.length) {
        allFound.push(data.found)

        const html = allFound.map((f) => {
          return `${f[0]},${JSON.stringify(f[1])}`
        }).join('; ')

        found.innerHTML = html
      }
    }
  }

  const fillNode = function (data) {
    const el = d3.select(`#node-${data.state} circle`)
    if (prev) {
      prev.style('fill', '')
      if (el.id === prev.id) {
        setTimeout(() => {
          _fillNode(el, data)
        }, 100)
        return
      }
    }

    _fillNode(el, data)
  }

  btn.addEventListener('click', () => {
    aho.search(text.value)
  })

  const running = function (s) {
    [text, btn, keywords, range].forEach((el) => {
      s ? el.setAttribute('disabled', 'disabled') : el.removeAttribute('disabled')
    })
  }

  AhoCorasick.prototype.search = function (string) {
    restart()

    let state = 0
    const results = []

    let time = 0
    const rv = range.value * 10
    const c = function (data) {
      time += rv
      setTimeout(() => {
        if (data.state === null) {
          running(false)
        }
        else {
          currentS.innerHTML = data.state
          fillNode(data)
        }
      }, time)
    }

    fillNode({ state, index: 0 })
    running(true)
    for (let i = 0; i < string.length; i++) {
      const l = string[i]
      while (state > 0 && !(l in this.gotoFn[state])) {
        state = this.failure[state]
        c({ state, token: l, result: 0, found: [], index: i })
      }

      if (!(l in this.gotoFn[state])) {
        c({ state, token: l, result: 0, found: [], index: i })
        continue
      }

      state = this.gotoFn[state][l]

      if (this.output[state].length) {
        const foundStrs = this.output[state]
        results.push([i, foundStrs])
        c({ state, token: l, result: 2, found: [i, foundStrs], index: i })
      }
      else {
        c({ state, token: l, result: 1, found: [], index: i })
      }
    }
    c({ state: null })

    return results
  }

  var draw = function (aho) {
    // objects are unordered collections
    const failureArr = []
    for (var i in aho.failure) {
      failureArr.push(i)
    }
    const failureHTMLHead = ['<th>i</th>']
    const failureHTMLBody = ['<td>f(i)</td>']
    failureArr.sort().forEach((i) => {
      failureHTMLHead.push(`<th>${i}</th>`)
      failureHTMLBody.push(`<td>${aho.failure[i]}</td>`)
    })
    failure.querySelector('thead').innerHTML = `<tr>${failureHTMLHead.join('')}</tr>`
    failure.querySelector('tbody').innerHTML = `<tr>${failureHTMLBody.join('')}</tr>`

    const outputArr = []
    for (var i in aho.output) {
      if (aho.output[i].length) {
        outputArr.push(i)
      }
    }
    const outputHtmlBody = []
    outputArr.sort().forEach((i) => {
      outputHtmlBody.push(`<tr><td>${i}</td>`)
      outputHtmlBody.push(`<td>{${aho.output[i].map((j) => {
				return j
			}).join(', ')}}</td></tr>`)
    })
    output.querySelector('thead').innerHTML = '<tr><th>i</th><th>output(i)</th></tr>'
    output.querySelector('tbody').innerHTML = outputHtmlBody.join('')

    const g = new dagreD3.graphlib.Graph()

    // Set an object for the graph label
    g.setGraph({
      rankdir: 'LR',
      marginx: 20,
      marginy: 20,
    })

    g.setDefaultEdgeLabel({})

    g.setEdge(0, 0, { label: `¬ {${Object.keys(aho.gotoFn[0]).join(',')}}`, id: 'edge-0-0' })
    for (const state in aho.gotoFn) {
      const transitions = aho.gotoFn[state]
      g.setNode(state, {
        label: state,
        shape: 'circle',
        id: `node-${state}`,
      })
      for (const symbol in transitions) {
        const targetState = transitions[symbol]
        g.setEdge(
          state,
          targetState,
          {
            label: symbol,
            id: `edge-${state}-${targetState}`,
          },
        )
      }
    }

    const svg = d3.select('svg')
    const inner = svg.select('g')
    const zoom = d3.zoom().on('zoom', () => {
      inner.attr('transform', d3.event.transform)
    })
    svg.call(zoom)

    svg.append('text').attr('x', 20).attr('y', 20).text('goto function')

    dagreD3.render(g)

    const render = new dagreD3.render()
    inner.call(render, g)

    // Zoom and scale to fit
    const graphWidth = g.graph().width + 80
    const graphHeight = g.graph().height + 40
    const width = Number.parseInt(svg.style('width').replace(/px/, ''))
    const height = Number.parseInt(svg.style('height').replace(/px/, ''))
    const zoomScale = Math.min(width / graphWidth, height / graphHeight)
    const translateX = (width / 2) - ((graphWidth * zoomScale) / 2)
    const translateY = (height / 2) - ((graphHeight * zoomScale) / 2)
    const svgZoom = svg
    svgZoom.call(zoom.transform, d3.zoomIdentity.translate(translateX, translateY).scale(zoomScale))
  }

  restart()
}
