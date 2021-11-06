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

// autolink for {github,fixrtm,kaiz}

// github schema
const ghSchema = {}
{
  let urlHashRegex
  let repositoryElementInfoRegex
  let repositoryInfoRegex
  let userRepositoryInfoRegex
  // initalize regexes
  {
    // alpha numbernic
    const alnum = 'a-zA-Z0-9'
    const nonEndDot = '\\.(?=\\S|$)'
    const pathOrQueryChars = `(?:[a-zA-Z0-9-_+%&]|${nonEndDot})`
    const srcUsername = `(?<user>[${alnum}](?:[${alnum}]|-(?=[${alnum}])){0,38})`
    const srcReponame = `(?<repo>(?:[${alnum}_-]|${nonEndDot}){1,100})`
    const srcIssuePart = '#(?<issue>[0-9]+)'
    const commitPart = `@(?<commit>(?:[${alnum}_-]|${nonEndDot})+)`
    const hash = `(?<hash>#${pathOrQueryChars}+)`
    const hashOpt = `${hash}?`
    const path = `(?<path>/${pathOrQueryChars}*)`
    // #num or @commit or @commit/path
    const repositoryElementInfoPart = '(?:' + (srcIssuePart + '|' + commitPart + path + '?') + ')'
    const repositoryInfoPart = srcReponame + repositoryElementInfoPart + '?'
    const userOrRepositoryInfoPart = srcUsername + '(?:/' + repositoryInfoPart + ')?'
    urlHashRegex = new RegExp('^' + hash)
    repositoryElementInfoRegex = new RegExp('^' + repositoryElementInfoPart + hashOpt)
    repositoryInfoRegex = new RegExp('^' + repositoryInfoPart + hashOpt)
    userRepositoryInfoRegex = new RegExp('^' + userOrRepositoryInfoPart + hashOpt)
  }

  const buildGithubUrl = (options) => {
    let result = 'https://github.com/'
    result += options.user
    if (options.repo) result += `/${options.repo}`
    if (options.issue) result += `/issues/${options.issue}`
    if (options.commit) {
      if (options.path) {
        result += `/tree/${options.commit}${options.path}`
      } else {
        result += `/commit/${options.commit}`
      }
    }
    if (options.hash) result += options.hash
    return result
  }

  const makeGithubSchema = (schema, user, repo) => {
    let regexes
    if (!user) {
      regexes = [userRepositoryInfoRegex]
    } else if (!repo) {
      regexes = [repositoryInfoRegex, urlHashRegex]
    } else {
      regexes = [repositoryElementInfoRegex, repositoryInfoRegex, urlHashRegex]
    }
    const matcher = (str) => {
      for (const regex of regexes) {
        const match = str.match(regex)
        if (match) return match
      }
      return null
    }
    const schemaLen = schema.length

    const validate = (text) => matcher(text)?.[0]?.length || null
    const test = (text) => text.substr(0, schemaLen) === schema && validate(text.slice(schemaLen)) === (text.length - schemaLen)
    const normalize = (url) => {
      const tail = url.slice(schemaLen)
      const matched = matcher(tail).groups
      matched.user = matched.user ?? user
      matched.repo = matched.repo ?? repo
      return buildGithubUrl(matched)
    }
    return {
      schema: schema,
      validate: validate,
      test: test,
      normalize: normalize
    }
  }

  const schemas = [
    makeGithubSchema('github:'),
    makeGithubSchema('fixrtm:', 'fixrtm', 'fixRTM'),
    makeGithubSchema('kaiz:', 'Kai-Z-JP', 'KaizPatchX'),
    makeGithubSchema('anatawa12:', 'anatawa12')
  ]

  ghSchema.linkifyInit = (linkify) => {
    for (const schema of schemas) addGithubSchema(linkify, schema)

    function addGithubSchema(linkify, schema) {
      linkify.add(schema.schema, {
        validate: (text, pos) => schema.validate(text.slice(pos)) ?? 0,
        normalize: (match) => {
          match.url = schema.normalize(match.url)
        }
      })
    }
  }

  ghSchema.mdInit = (md) => {
    const normalizeLinkOld = md.normalizeLink
    md.normalizeLink = (url) => {
      for (const schema of schemas) {
        if (schema.test(url)) return schema.normalize(url)
      }
      return normalizeLinkOld(url)
    }
    const normalizeLinkTextOld = md.normalizeLinkText
    md.normalizeLinkText = (url) => {
      for (const schema of schemas) {
        if (schema.test(url)) return url
      }
      return normalizeLinkTextOld(url)
    }
  }
}

function linkifyInit(linkify) {
  ghSchema.linkifyInit(linkify)
}

module.exports = {
  init (mdinst) {
    linkifyInit(mdinst.linkify)
    ghSchema.mdInit(mdinst)
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
