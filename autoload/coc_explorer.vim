function! coc_explorer#create(bufnr, position, width, toggle, name)
  let status = coc_explorer#init_buffer(a:bufnr, a:position, a:width, a:toggle, a:name)

  if status ==# 'quit'
    return [-1, v:true]
  elseif status ==# 'create'
    let inited = exists('b:coc_explorer_inited')
    if ! inited
      let b:coc_explorer_inited = v:true
    endif

    call coc_explorer#init_buf()

    return [bufnr('%'), inited]
  else
    return [bufnr('%'), v:true]
  endif
endfunction

" returns is 'quit' or 'resume' or 'create'
function! coc_explorer#init_buffer(bufnr, position, width, toggle, name)
  let name = '['.a:name.']'
  if a:position ==# 'tab'
    execute 'silent keepalt tabnew '.name
    call coc_explorer#init_win(a:position, a:width)
    return 'create'
  else
    if a:bufnr != v:null
      " explorer in visible window
      let winnr = bufwinnr(a:bufnr)
      if winnr > 0
        if a:toggle
          execute winnr.'wincmd q'
          return 'quit'
        else
          execute winnr.'wincmd w'
          return 'resume'
        endif
      endif
    endif
    if a:position ==# 'left'
      wincmd t
      if a:bufnr == v:null
        execute 'silent keepalt leftabove vsplit '.name
      else
        execute 'silent keepalt leftabove vertical sb '.a:bufnr
      endif
      call coc_explorer#init_win(a:position, a:width)
      return 'create'
    elseif a:position ==# 'right'
      wincmd b
      if a:bufnr == v:null
        execute 'silent keepalt rightbelow vsplit '.name
      else
        execute 'silent keepalt rightbelow vertical sb '.a:bufnr
      endif
      call coc_explorer#init_win(a:position, a:width)
      return 'create'
    else
      throw 'No support position '.a:position
    endif
  endif
endfunction

function! coc_explorer#init_win(position, width)
  if a:position !=# 'tab'
    silent setlocal winfixwidth
    silent execute 'vertical resize '.a:width
  endif

  silent setlocal colorcolumn=
        \ conceallevel=0 concealcursor=nc nocursorcolumn
        \ nofoldenable foldcolumn=0
        \ nolist
        \ nonumber norelativenumber
        \ nospell
        \ nowrap
endfunction

function! coc_explorer#init_buf()
  silent setlocal buftype=nofile bufhidden=hide
        \ noswapfile nomodeline
        \ filetype=coc-explorer
        \ cursorline
        \ nomodifiable
        \ nomodified
        \ signcolumn=no
        \ conceallevel=3
        \ concealcursor=nvic
        \ nobuflisted
endfunction

function! coc_explorer#is_float_window(winnr)
  if has('nvim') && exists('*nvim_win_get_config')
    let winid = win_getid(a:winnr)
    return nvim_win_get_config(winid)['relative'] != ''
  else
    return 0
  endif
endfunction


let s:select_wins_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function! coc_explorer#select_wins_restore(store)
  for winnr in keys(a:store)
    call setwinvar(winnr, '&statusline', a:store[winnr])
  endfor
endfunction

" returns
"   -1  - User cancelled
"   0   - No window selected
"   > 0 - Selected winnr
function! coc_explorer#select_wins(explrer_bufname, filterFloatWindows)
  let store = {}
  let char_idx_mapto_winnr = {}
  let char_idx = 0
  let explorer_name = '['.a:explrer_bufname.']'
  for winnr in range(1, winnr('$'))
    if a:filterFloatWindows && coc_explorer#is_float_window(winnr)
      continue
    endif
    if bufname(winbufnr(winnr)) == explorer_name
      continue
    endif
    let store[winnr] = getwinvar(winnr, '&statusline')
    let char_idx_mapto_winnr[char_idx] = winnr
    let char = s:select_wins_chars[char_idx]
    let statusline = printf('%%#CocExplorerSelectUI#%s %s', repeat(' ', winwidth(winnr)/2-1), char)
    call setwinvar(winnr, '&statusline', statusline)
    let char_idx += 1
  endfor
  if len(char_idx_mapto_winnr) == 0
    call coc_explorer#select_wins_restore(store)
    return 0
  elseif len(char_idx_mapto_winnr) == 1
    call coc_explorer#select_wins_restore(store)
    return char_idx_mapto_winnr[0]
  else
    redraw!
    let select_winnr = -1
    while 1
      echo 'Please use the letter on statusline to select window, or use <ESC> to cancel'
      let nr = getchar()
      if nr == 27 " ESC
        break
      else
        let select_winnr = get(char_idx_mapto_winnr, string(nr - char2nr('a')), -1)
        if select_winnr != -1
          break
        endif
      endif
    endwhile
    call coc_explorer#select_wins_restore(store)
    return select_winnr
  endif
endfunction

function! coc_explorer#add_matchids(ids)
  let w:coc_matchids = get(w:, 'coc_explorer_matchids', []) + a:ids
endfunction

function! coc_explorer#clearmatches(ids, ...)
  let winid = get(a:, 1, 0)
  if winid != 0 && win_getid() != winid
    return
  endif
  for id in a:ids
    try
      call matchdelete(id)
    catch /.*/
      " matches have been cleared in other ways,
    endtry
  endfor
  let exists = get(w:, 'coc_explorer_matchids', [])
  if !empty(exists)
    call filter(w:coc_matchids, 'index(a:ids, v:val) == -1')
  endif
endfunction

function! coc_explorer#register_mappings(mappings)
  let s:coc_explorer_mappings = a:mappings
  augroup coc_explorer_mappings
    au!
    autocmd FileType coc-explorer call coc_explorer#execute_mappings(s:coc_explorer_mappings)
  augroup END
endfunction

function! coc_explorer#execute_mappings(mappings)
  if &filetype == 'coc-explorer'
    for [key, mapping] in items(a:mappings)
      for [mode, target] in items(mapping)
        execute mode . 'map <buffer> ' . key . ' ' . target
      endfor
    endfor
  endif
endfunction

function! coc_explorer#clear_mappings(mappings)
  if &filetype == 'coc-explorer'
    for [key, mapping] in items(a:mappings)
      for [mode, target] in items(mapping)
        execute mode . 'unmap <buffer> ' . key
      endfor
    endfor
  endif
endfunction

function! coc_explorer#register_syntax_highlights(syntax_highlights)
  let s:coc_explorer_syntax_highlights = a:syntax_highlights
  autocmd Syntax coc-explorer call coc_explorer#execute_syntax_highlights(s:coc_explorer_syntax_highlights)
endfunction

function! coc_explorer#execute_syntax_highlights(syntax_highlights)
  for sh in a:syntax_highlights
    execute printf('syntax region %s matchgroup=%sGroup start=/\V<%s|/ end=/\V|%s>/ concealends contained', sh['group'], sh['group'], sh['markerID'],  sh['markerID'])
    execute printf('syntax match %sMatch /\V<%s|\.\*|%s>/ contains=%s', sh['group'], sh['markerID'], sh['markerID'], sh['group'])
    execute sh['command']
  endfor
endfunction

function! coc_explorer#truncate(name, link_target, fullwidth, omit)
  let name_text_width = strdisplaywidth(a:name)
  let link_text_width = strdisplaywidth(a:link_target)
  if name_text_width < a:fullwidth - 3
    return [a:name, s:truncate(a:link_target, a:fullwidth - name_text_width, a:omit)]
  else
    let text_width = name_text_width + link_text_width
    if link_text_width == 0
      let name_fullwidth = a:fullwidth
      let link_fullwidth = 0
    else
      let name_fullwidth = float2nr(ceil(a:fullwidth * 0.7 - 3))
      let link_fullwidth = a:fullwidth - name_fullwidth
    endif
    let name = s:truncate(a:name, name_fullwidth, a:omit)
    if link_fullwidth > 0
      let link = s:truncate(a:link_target, link_fullwidth, a:omit)
    else
      let link = ''
    endif
    return [name, link]
  endif
endfunction

function! s:truncate(str, fullwidth, omit)
  " Modified from https://github.com/Shougo/defx.nvim/blob/f81aa358afae22c89ce254db3f589212637bc1ba/autoload/defx/util.vim#L258
  let width = strdisplaywidth(a:str)
  if width <= a:fullwidth
    let ret = a:str
  else
    let omit_width = strdisplaywidth(a:omit)
    let left_width = float2nr(ceil((a:fullwidth - omit_width) / 2.0))
    let right_width = a:fullwidth - left_width - omit_width
    let ret = s:strwidthpart(a:str, left_width) . a:omit
         \ . s:strwidthpart_reverse(a:str, right_width)
  endif
  return s:pad_end(ret, a:fullwidth)
endfunction

function! s:pad_end(str, width)
  if a:str =~# '^[\x00-\x7f]*$'
    return strdisplaywidth(a:str) < a:width
          \ ? printf('%-' . a:width . 's', a:str)
          \ : strpart(a:str, 0, a:width)
  endif

  let ret = a:str
  let width = strdisplaywidth(a:str)
  if width > a:width
    let ret = s:strwidthpart(ret, a:width)
    let width = strdisplaywidth(ret)
  endif

  if width < a:width
    let ret .= repeat(' ', a:width - width)
  endif

  return ret
endfunction

function! s:strwidthpart(str, width)
  let str = tr(a:str, "\t", ' ')
  let vcol = a:width + 2
  return matchstr(str, '.*\%<' . (vcol < 0 ? 0 : vcol) . 'v')
endfunction

function! s:strwidthpart_reverse(str, width)
  let str = tr(a:str, "\t", ' ')
  let vcol = strdisplaywidth(str) - a:width
  return matchstr(str, '\%>' . (vcol < 0 ? 0 : vcol) . 'v.*')
endfunction
