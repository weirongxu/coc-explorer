function! s:check_focus(options, fallback_winid) abort
  if !get(a:options, 'focus', v:true)
    call win_gotoid(a:fallback_winid)
  endif
endfunction

function! s:init_buf(bufnr, winid) abort
  call coc_explorer#init#buf(a:bufnr)
  call coc_explorer#init#win(a:bufnr, a:winid)
  call setbufvar(a:bufnr, '&wrap', 0)
  call setbufvar(a:bufnr, '&cursorline', 1)
  let filetype = 'coc-explorer'
  call setbufvar(a:bufnr, '&filetype', filetype)
  if exists('*CocExplorerInited')
    call CocExplorerInited(filetype, a:bufnr)
  endif
endfunction

function! s:tab_cmd(pos) abort
  if has_key(a:pos, 'arg')
    return a:pos.arg . 'tabnew'
  else
    return 'tabnew'
  endif
endfunction

function! coc_explorer#open_explorer(explorer_id, position, options) abort
  let name = get(a:options, 'name', '[coc-explorer]-'.a:explorer_id)
  let border_bufnr = v:null
  let border_winid = v:null
  let fallback_winid = win_getid()
  if a:position.name ==# 'tab'
    echom s:tab_cmd(a:position)
    execute 'silent noswapfile keepalt '.s:tab_cmd(a:position).' '.name
    let bufnr = bufnr('%')
    let winid = win_getid()
    call s:init_buf(bufnr, winid)
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'left'
    wincmd t
    execute 'silent noswapfile keepalt vertical topleft vsplit '.name
    let bufnr = bufnr('%')
    let winid = win_getid()
    call coc_explorer#resize(bufnr, a:position, a:options)
    call s:init_buf(bufnr, winid)
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'right'
    wincmd b
    execute 'silent noswapfile keepalt vertical botright vsplit '.name
    let bufnr = bufnr('%')
    let winid = win_getid()
    call coc_explorer#resize(bufnr, a:position, a:options)
    call s:init_buf(bufnr, winid)
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'floating'
    let float_options = extend(a:options, {'name': name, 'focus': v:true})
    let [bufnr, border_bufnr] = coc_explorer#float#create(float_options)
    let float_options = extend({'border_bufnr': border_bufnr}, float_options)
    let [winid, border_winid] = coc_explorer#float#open(bufnr, float_options)
    call s:init_buf(bufnr, winid)
  else
    throw 'No support position "'.a:position.name.'"'
  endif
  return [bufnr, border_bufnr, winid, border_bufnr]
endfunction

function! coc_explorer#resume(bufnr, position, options) abort
  let fallback_winid = win_getid()
  if a:position.name ==# 'tab'
    execute s:tab_cmd(a:position)
    execute 'silent keepalt buffer'.a:bufnr
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'left'
    wincmd t
    execute 'silent keepalt vertical topleft sb '.a:bufnr
    call coc_explorer#resize(a:bufnr, a:position, a:options)
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'right'
    wincmd b
    execute 'silent keepalt vertical botright sb '.a:bufnr
    call coc_explorer#resize(a:bufnr, a:position, a:options)
    call s:check_focus(a:options, fallback_winid)
  elseif a:position.name ==# 'floating'
    call coc_explorer#float#resume(a:bufnr, a:options)
  else
    throw 'No support position "'.a:position.name.'"'
  endif
endfunction

function! coc_explorer#resize(bufnr, position, options) abort
  if a:position.name ==# 'tab'
    return
  endif
  if a:position.name ==# 'floating'
    call coc_explorer#float#resize(a:bufnr, a:options)
    return
  endif
  call setbufvar(a:bufnr, '&winfixwidth', 1)
  call coc_explorer#win#set_width(bufwinid(a:bufnr), a:options.width)
endfunction
