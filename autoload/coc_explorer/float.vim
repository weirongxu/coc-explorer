function! s:vim_win_config(options) abort
  let config = {
        \ 'line': a:options.top + 1,
        \ 'col': a:options.left + 1,
        \ 'maxwidth': a:options.width,
        \ 'maxheight': a:options.height,
        \ 'highlight': 'CocExplorerNormalFloat',
        \ }
  if a:options.border_enable
    let config = extend(config, {
          \ 'border': 1,
          \ 'borderchars': a:options.border_chars,
          \ 'close': 'button',
          \ 'borderhighlight': 'CocExplorerNormalFloatBorder',
          \ })
  endif
  return config
endfunction

function! s:nvim_win_config(options, size_change) abort
  let width = a:options.width + a:size_change * 2
  let height = a:options.height + a:size_change * 2
  let row = a:options.top - a:size_change
  let col = a:options.left - a:size_change
  return {
        \ 'relative': 'editor',
        \ 'row': row,
        \ 'col': col,
        \ 'width': width,
        \ 'height': height,
        \ }
endfunction

function! s:nvim_border_render(bufnr, options) abort
  let repeat_width = a:options.width - 2
  let title = a:options.title
  let title_width = strdisplaywidth(a:options.title)

  " if title is not empty, pad it from both sides
  if strlen(a:options.title)
    let title = ' ' . a:options.title . ' '
    let title_width += 2
  endif

  let [c_top, c_right, c_bottom, c_left, c_topleft, c_topright, c_botright, c_botleft] = a:options.border_chars
  let content = [c_topleft . title . repeat(c_top, repeat_width - title_width) . c_topright]
  let content += repeat([c_left . repeat(' ', repeat_width) . c_right], a:options.height - 2)
  let content += [c_botleft . repeat(c_bottom, repeat_width) . c_botright]

  call nvim_buf_set_option(a:bufnr, 'modifiable', v:true)
  call nvim_buf_set_option(a:bufnr, 'readonly', v:false)
  call nvim_buf_set_lines(a:bufnr, 0, -1, v:false, content)
  call nvim_buf_set_option(a:bufnr, 'modifiable', v:false)
  call nvim_buf_set_option(a:bufnr, 'readonly', v:true)
endfunction

if has('nvim')
  function! coc_explorer#float#create(options) abort
    let name = get(a:options, 'name', '')
    let border_bufnr = nvim_create_buf(v:false, v:true)
    let bufnr = coc_explorer#buf#create(name)
    call coc_explorer#init#buf(bufnr)
    call coc_explorer#init#buf(border_bufnr)
    return [bufnr, border_bufnr]
  endfunction

  function! coc_explorer#float#open(bufnr, options) abort
    let win_config = s:nvim_win_config(a:options, 0)
    let border_winid = v:null
    let focus = get(a:options, 'focus', v:true)
    let border_bufnr = get(a:options, 'border_bufnr', v:null)
    if a:options.border_enable && border_bufnr isnot v:null
      let border_winid = nvim_open_win(border_bufnr, v:false, win_config)
      call s:nvim_border_render(border_bufnr, a:options)
      call coc_explorer#init#win(border_bufnr, border_winid)
      call setbufvar(border_bufnr, '&cursorcolumn', 0)
      call setbufvar(border_bufnr, '&cursorline', 0)
      call setwinvar(border_winid, '&winhl', 'Normal:CocExplorerNormalFloatBorder')
      let filetype = 'coc-explorer-border'
      call setbufvar(border_bufnr, '&filetype', filetype)
      if exists('*CocExplorerInited')
        call CocExplorerInited(filetype, border_bufnr)
      endif

      let winid = nvim_open_win(a:bufnr, focus, s:nvim_win_config(a:options, -1))
      if has('nvim-0.5.1')
        call nvim_win_set_config(winid, {'zindex': 60})
      endif
    else
      let winid = nvim_open_win(a:bufnr, focus, win_config)
    endif

    call setwinvar(winid, '&winhl', 'Normal:CocExplorerNormalFloat')
    return [winid, border_winid]
  endfunction

  function! coc_explorer#float#resume(bufnr, options) abort
    let win_config = s:nvim_win_config(a:options, 0)
    let border_bufnr = get(a:options, 'border_bufnr', v:null)
    if a:options.border_enable && border_bufnr isnot v:null
      call s:nvim_border_render(border_bufnr, a:options)
      let border_winid = nvim_open_win(border_bufnr, v:false, win_config)
      call coc_explorer#init#win(border_bufnr, border_winid)
      let winid = nvim_open_win(a:bufnr, v:true, s:nvim_win_config(a:options, -1))
      if has('nvim-0.5.1')
        call nvim_win_set_config(winid, {'zindex': 60})
      endif
    else
      call nvim_open_win(a:bufnr, v:true, win_config)
    endif
  endfunction

  function! coc_explorer#float#resize(bufnr, options) abort
    let win_config = s:nvim_win_config(a:options, 0)
    let border_bufnr = get(a:options, 'border_bufnr', v:null)
    if a:options.border_enable && border_bufnr isnot v:null
      call s:nvim_border_render(border_bufnr, a:options)
      call nvim_win_set_config(bufwinid(border_bufnr), win_config)
      call nvim_win_set_config(bufwinid(a:bufnr), s:nvim_win_config(a:options, -1))
    else
      call nvim_win_set_config(bufwinid(a:bufnr), win_config)
    endif
  endfunction
else
  function! coc_explorer#float#create(options) abort
    let name = get(a:options, 'name', '')
    let bufnr = coc_explorer#buf#create(name)
    call coc_explorer#init#buf(bufnr)
    return [bufnr, v:null]
  endfunction

  function! coc_explorer#float#open(bufnr, options) abort
    let win_config = s:vim_win_config(a:options)
    let winid = popup_create(a:bufnr, win_config)
    call coc_explorer#init#win(a:bufnr, winid)
    return [winid, v:null]
  endfunction

  function! coc_explorer#float#resume(bufnr, options) abort
  endfunction

  function! coc_explorer#float#resize(bufnr, options) abort
  endfunction
endif
