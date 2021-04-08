function! coc_explorer#highlight#extract_colors(highlight_groups) abort
  let hl_map = {}
  for group in a:highlight_groups
    let hlid = synIDtrans(hlID(group))
    if hlid == 0
      continue
    endif
    let hl = {
          \ 'guibg': synIDattr(hlid, 'bg', 'gui'),
          \ 'guifg': synIDattr(hlid, 'fg', 'gui'),
          \ 'ctermbg': synIDattr(hlid, 'bg', 'cterm'),
          \ 'ctermfg': synIDattr(hlid, 'fg', 'cterm'),
          \ }
    let hl_map[group] = hl
  endfor
  return hl_map
endfunction
