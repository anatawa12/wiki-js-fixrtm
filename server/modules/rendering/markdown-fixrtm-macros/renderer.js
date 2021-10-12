// ------------------------------------
// Markdown - fixRTM Macro Preprocessor
// ------------------------------------

/**
 * Creates block ruler srrounded with '```'
 * @param {string} lang the block language tag
 * @param {string} tag the name of rule tag
 * @param {function(string):any} parser
 * @returns
 */
function blockRuler(lang, tag, parser) {
  const openMarker = '```' + lang
  const openChar = openMarker.charCodeAt(0)
  const closeMarker = '```'
  const closeChar = closeMarker.charCodeAt(0)
  return (state, startLine, endLine, silent) => {
    let nextLine
    let markup
    let params
    let token
    let i
    let autoClosed = false
    let start = state.bMarks[startLine] + state.tShift[startLine]
    let max = state.eMarks[startLine]

    // Check out the first character quickly,
    // this should filter out most of non-uml blocks
    //
    if (openChar !== state.src.charCodeAt(start)) { return false }

    // Check out the rest of the marker string
    //
    for (i = 0; i < openMarker.length; ++i) {
      if (openMarker[i] !== state.src[start + i]) { return false }
    }

    markup = state.src.slice(start, start + i)
    params = state.src.slice(start + i, max)

    // Since start is found, we can report success here in validation mode
    //
    if (silent) { return true }

    // Search for the end of the block
    //
    nextLine = startLine

    for (;;) {
      nextLine++
      if (nextLine >= endLine) {
        // unclosed block should be autoclosed by end of document.
        // also block seems to be autoclosed by end of parent
        break
      }

      start = state.bMarks[nextLine] + state.tShift[nextLine]
      max = state.eMarks[nextLine]

      if (start < max && state.sCount[nextLine] < state.blkIndent) {
        // non-empty line with negative indent should stop the list:
        // - ```
        //  test
        break
      }

      if (closeChar !== state.src.charCodeAt(start)) {
        // didn't find the closing fence
        continue
      }

      if (state.sCount[nextLine] > state.sCount[startLine]) {
        // closing fence should not be indented with respect of opening fence
        continue
      }

      let closeMarkerMatched = true
      for (i = 0; i < closeMarker.length; ++i) {
        if (closeMarker[i] !== state.src[start + i]) {
          closeMarkerMatched = false
          break
        }
      }

      if (!closeMarkerMatched) {
        continue
      }

      // make sure tail has spaces only
      if (state.skipSpaces(start + i) < max) {
        continue
      }

      // found!
      autoClosed = true
      break
    }

    const contents = state.src
      .split('\n')
      .slice(startLine + 1, nextLine)
      .join('\n')

    token = state.push(tag, tag, 0)

    token.meta = parser(contents)
    token.block = true
    token.info = params
    token.map = [ startLine, nextLine ]
    token.markup = markup

    state.line = nextLine + (autoClosed ? 1 : 0)

    return true
  }
}

/**
 * Creates single-line block ruler
 * @param {string} prefix the prefix of the rule
 * @param {string} tag the name of rule tag
 * @param {function(string):any} parser
 * @returns
 */
function lineBlockRuler(prefix, tag, parser) {
  const openChar = prefix.charCodeAt(0)
  return (state, startLine, _endLine, silent) => {
    let markup
    let params
    let token
    let i
    let start = state.bMarks[startLine] + state.tShift[startLine]
    let max = state.eMarks[startLine]

    // Check out the first character quickly,
    // this should filter out most of non-uml blocks
    //
    if (openChar !== state.src.charCodeAt(start)) { return false }

    // Check out the rest of the marker string
    //
    for (i = 0; i < prefix.length; ++i) {
      if (prefix[i] !== state.src[start + i]) { return false }
    }

    markup = state.src.slice(start, start + i)
    params = state.src.slice(start + i, max)

    // Since start is found, we can report success here in validation mode
    //
    if (silent) { return true }

    token = state.push(tag, tag, 0)

    token.meta = parser(params.trim())
    token.block = true
    token.info = params
    token.map = [ startLine, startLine ]
    token.markup = markup

    state.line = startLine + 1

    return true
  }
}

module.exports = {
  init (mdinst) {
    mdinst.block.ruler.before('fence', 'macro_versions', blockRuler('#!versions', 'macro_versions', (contents) => {
      return contents.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => line.split('=', 2))
        .reduce((acc, [key, ver]) => Object.assign(acc, {[key]: ver}), {})
    }), {
      alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
    })
    mdinst.renderer.rules.macro_versions = (tokens, idx) => {
      let table = tokens[idx].meta
      let builder = ''
      builder += `<table>\n<thead><tr><th>mod</th><th>version</th></tr></thead><tbody>`

      function addRow(key, name, always) {
        let version = table[key]
        if (version == null && !always) return
        if (version == null) version = 'not available'
        if (version === 'drop') return
        let versionHTML = version.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        builder += `<tr><td>${name}</td><td>${versionHTML}</td></tr>`
      }

      addRow('fixrtm', 'fixRTM', !table['rtm'] || !table['rtm'].match(/1\.12\.2|^2\./))
      addRow('fixrtm.pre', 'fixRTM(pre release)', false)
      addRow('kaiz', 'KaizPatchX', true)
      addRow('kaiz.pre', 'KaizPatchX(pre release)', false)
      addRow('rtm', 'RTM', false)

      builder += `</tbody></table>\n`
      return builder
    }

    // Anchor
    mdinst.block.ruler.before('fence', 'macro_ancher', lineBlockRuler('#!anchor', 'macro_ancher', (params) => params), {
      alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
    })
    mdinst.renderer.rules.macro_ancher = (tokens, idx) => {
      let anchor = tokens[idx].meta
      return `<span id="${anchor.replace(/"/, '&quot;')}"></span>`
    }
  }
}
