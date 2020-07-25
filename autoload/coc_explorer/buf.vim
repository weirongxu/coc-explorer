functio! coc_explorer#buf#create_by_name(name) abort
  return bufadd(a:name)
endfunction

if has('nvim')
  function! coc_explorer#buf#create(...) abort
    let name = get(a:000, 0, '')
    if name is ''
      return nvim_create_buf(v:false, v:true)
    else
      return coc_explorer#buf#create_by_name(name)
    endif
  endfunction
else
  function! coc_explorer#buf#create(...) abort
    let name = get(a:000, 0, '')
    return coc_explorer#buf#create_by_name(name)
  endfunction
endif
