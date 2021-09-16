// ------------------------------------
// Markdown - Version Table Macro Preprocessor
// ------------------------------------

module.exports = {
  init (mdinst, conf) {
    mdinst.use((md, opts) => {
      const openMarker = opts.openMarker || '```#!versions'
      const openChar = openMarker.charCodeAt(0)
      const closeMarker = opts.closeMarker || '```'
      const closeChar = closeMarker.charCodeAt(0)

      md.block.ruler.before('fence', 'macro_versions', (state, startLine, endLine, silent) => {
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

        // TODO: HERE IS THE START OF MY CODE

        token = state.push('macro_versions', 'versions_table', 0)

        let table = {}
        for (let line of contents.split('\n')) {
          if (line.trim() === '') continue
          let [name, version] = line.split('=', 2)
          table[name] = version
        }

        token.meta = table
        token.block = true
        token.info = params
        token.map = [ startLine, nextLine ]
        token.markup = markup

        state.line = nextLine + (autoClosed ? 1 : 0)

        return true
      }, {
        alt: [ 'paragraph', 'reference', 'blockquote', 'list' ]
      })
      md.renderer.rules.macro_versions = (tokens, idx) => {
        let table = tokens[idx].meta
        let builder = ''
        builder += `<table>\n<thead><tr><th>mod</th><th>version</th></tr></thead><tbody>`

        function addRow(key, name, always) {
          let version = table[key]
          if (version == null && !always) return
          if (version == null) version = 'not available'
          let versionHTML = version.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          builder += `<tr><td>${name}</td><td>${versionHTML}</td></tr>`
        }

        addRow('fixrtm', 'fixRTM', !table['rtm'] || !table['rtm'].match(/1\.12\.2|^2\./))
        addRow('fixrtm.snapshot', 'fixRTM(SNAPSHOT)', false)
        addRow('kaiz', 'KaizPatchX', true)
        addRow('kaiz.candidate', 'KaizPatchX(Release Candidate)', false)
        addRow('rtm', 'RTM', false)

        builder += `</tbody></table>\n`
        return builder
      }
    }, {
      openMarker: conf.openMarker,
      closeMarker: conf.closeMarker
    })
  }
}
