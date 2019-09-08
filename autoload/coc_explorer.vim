function! coc_explorer#create(bufnr, position, width, toggle, name)
  let status = coc_explorer#create_buffer(a:bufnr, a:position, a:width, a:toggle, a:name)

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
function! coc_explorer#create_buffer(bufnr, position, width, toggle, name)
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

  silent setlocal colorcolumn conceallevel=0 concealcursor=nc nocursorcolumn nofoldenable foldcolumn=0 nolist nonumber norelativenumber nospell nowrap
endfunction

function! coc_explorer#init_buf()
  silent setlocal buftype=nofile bufhidden=hide noswapfile nomodeline filetype=coc-explorer nomodifiable nobuflisted nomodified signcolumn=no
endfunction


let s:select_wins_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function! coc_explorer#select_wins_restore(store)
  for winnr in keys(a:store)
    call setwinvar(winnr, '&statusline', a:store[winnr])
  endfor
endfunction

" returns
"   -1  - User cancelled
"   0   - No selection of window
"   > 0 - selected winnr
function! coc_explorer#select_wins(name)
  let store = {}
  let char_idx_mapto_winnr = {}
  let char_idx = 0
  let explorer_name = '['.a:name.']'
  for winnr in range(winnr(), winnr('$'))
    if bufname(winbufnr(winnr)) != explorer_name
      let store[winnr] = getwinvar(winnr, '&statusline')
      let char_idx_mapto_winnr[char_idx] = winnr
      let char = s:select_wins_chars[char_idx]
      let statusline = printf('%%#CocExplorerSelectUI#%s %s', repeat(' ', winwidth(winnr)/2-1), char)
      call setwinvar(winnr, '&statusline', statusline)
      let char_idx += 1
    endif
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
      let nr = getchar()
      if nr == 27
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
