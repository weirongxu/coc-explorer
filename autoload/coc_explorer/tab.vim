" Tab ID
let s:tab_id_max = 0

function! coc_explorer#tab#init_id() abort
  if !exists('t:coc_explorer_tab_id')
    let s:tab_id_max = s:tab_id_max + 1
    let t:coc_explorer_tab_id = s:tab_id_max
  endif
endfunction

function! coc_explorer#tab#current_id() abort
  call coc_explorer#tab#init_id()
  return t:coc_explorer_tab_id
endfunction

function! coc_explorer#tab#max_id() abort
  return s:tab_id_max
endfunction
